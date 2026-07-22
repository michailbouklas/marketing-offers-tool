import { prisma } from "$lib/server/prisma";
import {
  untitledConversation,
  type ChatAgentCount,
  type ChatConversationMessage,
  type ChatUsageOverview,
  type ChatUserCount,
  type UserChatAgentGroup,
} from "$lib/services/chat-usage";

/**
 * Read-side queries for the superUser chat-usage pages. All reads go through
 * the read-only Prisma views over Mastra's `mastra` schema
 * (`ai_chat_threads` / `ai_chat_messages`) — never write through these.
 */

/**
 * Splits a Mastra thread id of the form `<agentId>:<userId>:<sessionKey>`.
 * Returns null for ids that don't match the app's namespacing (e.g. threads
 * created outside the chat API).
 */
export function parseThreadId(
  threadId: string,
): { agentId: string; userId: string; sessionKey: string } | null {
  const first = threadId.indexOf(":");
  const last = threadId.lastIndexOf(":");

  if (first <= 0 || last <= first + 1 || last >= threadId.length - 1) {
    return null;
  }

  return {
    agentId: threadId.slice(0, first),
    userId: threadId.slice(first + 1, last),
    sessionKey: threadId.slice(last + 1),
  };
}

export async function getChatUsageOverview(): Promise<ChatUsageOverview> {
  const [totalChats, perAgent, perUserRows] = await Promise.all([
    prisma.ai_chat_threads.count(),
    prisma.$queryRaw<ChatAgentCount[]>`
      SELECT split_part(t."id", ':', 1) AS "agentId",
             COUNT(*)::int AS "count"
      FROM "public"."ai_chat_threads" t
      GROUP BY 1
      ORDER BY 2 DESC, 1 ASC
    `,
    prisma.$queryRaw<
      {
        userId: string;
        name: string | null;
        email: string | null;
        count: number;
        lastActivity: Date | null;
      }[]
    >`
      SELECT t."resourceId" AS "userId",
             u."name" AS "name",
             u."email" AS "email",
             COUNT(*)::int AS "count",
             MAX(t."updatedAt") AS "lastActivity"
      FROM "public"."ai_chat_threads" t
      LEFT JOIN "public"."user" u ON u."id" = t."resourceId"
      GROUP BY t."resourceId", u."name", u."email"
      ORDER BY COUNT(*) DESC, MAX(t."updatedAt") DESC
    `,
  ]);

  const perUser: ChatUserCount[] = perUserRows.map((row) => ({
    userId: row.userId,
    name: row.name,
    email: row.email,
    count: row.count,
    lastActivity: row.lastActivity ? row.lastActivity.toISOString() : null,
  }));

  return { totalChats, perAgent, perUser };
}

/**
 * All of one user's conversations grouped per agent (parsed from the thread
 * id prefix), newest first within each group. Groups are ordered by their
 * most recent conversation.
 */
export async function getUserChatsByAgent(
  userId: string,
): Promise<UserChatAgentGroup[]> {
  const threads = await prisma.ai_chat_threads.findMany({
    where: { resourceId: userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
  });

  if (threads.length === 0) {
    return [];
  }

  const messageCounts = await prisma.ai_chat_messages.groupBy({
    by: ["thread_id"],
    where: { thread_id: { in: threads.map((thread) => thread.id) } },
    _count: { _all: true },
  });

  const countByThread = new Map(
    messageCounts.map((row) => [row.thread_id, row._count._all]),
  );

  const groups = new Map<string, UserChatAgentGroup>();

  for (const thread of threads) {
    const agentId = parseThreadId(thread.id)?.agentId ?? "unknown";
    const group = groups.get(agentId) ?? { agentId, threads: [] };

    group.threads.push({
      id: thread.id,
      title: thread.title || untitledConversation,
      updatedAt: thread.updatedAt ? thread.updatedAt.toISOString() : null,
      messageCount: countByThread.get(thread.id) ?? 0,
    });

    groups.set(agentId, group);
  }

  // Threads are already newest-first, so first insertion order == recency.
  return [...groups.values()];
}

export async function getChatThreadById(threadId: string) {
  return prisma.ai_chat_threads.findUnique({
    where: { id: threadId },
    select: { id: true, resourceId: true, title: true, updatedAt: true },
  });
}

/**
 * Fallback conversation reader that parses the stored message-parts JSON
 * directly from the view. Only used when Mastra can no longer recall the
 * thread (e.g. the agent was removed from the registry).
 */
export async function getRawThreadMessages(
  threadId: string,
): Promise<ChatConversationMessage[]> {
  const rows = await prisma.ai_chat_messages.findMany({
    where: { thread_id: threadId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true },
  });

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    parts: parseMessageParts(row.content),
  }));
}

function parseMessageParts(content: string): { type: string; text?: string }[] {
  try {
    const parsed: unknown = JSON.parse(content);

    if (typeof parsed === "string") {
      return [{ type: "text", text: parsed }];
    }

    if (parsed && typeof parsed === "object") {
      const parts = (parsed as { parts?: unknown }).parts;

      if (Array.isArray(parts)) {
        return parts
          .filter(
            (part): part is { type: string; text?: string } =>
              !!part &&
              typeof part === "object" &&
              typeof (part as { type?: unknown }).type === "string",
          )
          .map((part) => ({
            type: part.type,
            text: typeof part.text === "string" ? part.text : undefined,
          }));
      }
    }
  } catch {
    // Not JSON — treat the raw column value as plain text below.
  }

  return [{ type: "text", text: content }];
}
