import { prisma } from "$lib/server/prisma";
import {
  untitledConversation,
  type ChatAgentCount,
  type ChatConversationMessage,
  type ChatUsageOverview,
  type ChatUserCount,
  type UserChatAgentGroup,
} from "$lib/services/chat-usage";
import type { RecentChatsData } from "$lib/dashboard/widgets";

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

/** True when `query` occurs in a stored message's text parts (case-insensitive). */
export function messageTextContains(content: string, query: string) {
  const needle = query.toLowerCase();

  return parseMessageParts(content).some(
    (part) => part.type === "text" && part.text?.toLowerCase().includes(needle),
  );
}

/**
 * Ids of the threads under `threadPrefix` (`<agentId>:<userId>:`, so always
 * one user's own chats) that have a message whose text contains `query`.
 */
export async function findThreadIdsWithText(
  threadPrefix: string,
  query: string,
): Promise<Set<string>> {
  const rows = await prisma.ai_chat_messages.findMany({
    where: {
      thread_id: { startsWith: threadPrefix },
      content: { contains: query, mode: "insensitive" },
    },
    select: { thread_id: true, content: true },
    orderBy: { createdAt: "desc" },
    // shortcut: unindexed scan capped at the newest 500 raw hits, and the raw
    // match runs on JSON-escaped text (a query with quotes or newlines
    // misses); move to a tsvector index if per-user history grows large.
    take: 500,
  });

  // `content` is the serialised parts JSON, so the raw match also hits JSON
  // keys and tool payloads ("text", "type"…); keep real text matches only.
  return new Set(
    rows
      .filter((row) => messageTextContains(row.content, query))
      .map((row) => row.thread_id),
  );
}

function parseMessageParts(content: string): ChatConversationMessage["parts"] {
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
            (part): part is Record<string, unknown> & { type: string } =>
              !!part &&
              typeof part === "object" &&
              typeof (part as { type?: unknown }).type === "string",
          )
          .map((part) => ({
            type: part.type,
            text: typeof part.text === "string" ? part.text : undefined,
            state: typeof part.state === "string" ? part.state : undefined,
            input: part.input,
            output: part.output,
            errorText:
              typeof part.errorText === "string" ? part.errorText : undefined,
          }));
      }
    }
  } catch {
    // Not JSON — treat the raw column value as plain text below.
  }

  return [{ type: "text", text: content }];
}

/**
 * The `limit` most recently updated chats across all users, grouped by user
 * (groups ordered by their newest chat) for the home dashboard widget.
 */
export async function getRecentChats(
  limit = 5,
): Promise<RecentChatsData["users"]> {
  const threads = await prisma.ai_chat_threads.findMany({
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { id: true, title: true, updatedAt: true, resourceId: true },
  });
  if (threads.length === 0) return [];

  const ids = threads.map((thread) => thread.id);
  const [users, messageCounts] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: threads.map((thread) => thread.resourceId) } },
      select: { id: true, name: true },
    }),
    prisma.ai_chat_messages.groupBy({
      by: ["thread_id"],
      where: { thread_id: { in: ids } },
      _count: { _all: true },
    }),
  ]);
  const nameById = new Map(users.map((user) => [user.id, user.name]));
  const countByThread = new Map(
    messageCounts.map((row) => [row.thread_id, row._count._all]),
  );

  const groups = new Map<string, RecentChatsData["users"][number]>();
  for (const thread of threads) {
    const group = groups.get(thread.resourceId) ?? {
      userId: thread.resourceId,
      name: nameById.get(thread.resourceId) ?? null,
      threads: [],
    };
    group.threads.push({
      id: thread.id,
      agentId: parseThreadId(thread.id)?.agentId ?? "unknown",
      title: thread.title || untitledConversation,
      updatedAt: thread.updatedAt ? thread.updatedAt.toISOString() : null,
      messageCount: countByThread.get(thread.id) ?? 0,
    });
    groups.set(thread.resourceId, group);
  }
  return [...groups.values()];
}

/** Thumbs up (1) / down (-1) on one answer; rating again overwrites. */
export async function saveChatFeedback(
  userId: string,
  feedback: {
    agentId: string;
    sessionKey: string;
    messageId: string;
    rating: 1 | -1;
    reason?: string;
  },
) {
  const { messageId, ...rest } = feedback;
  const data = { ...rest, reason: rest.reason || null };

  await prisma.chatFeedback.upsert({
    where: { userId_messageId: { userId, messageId } },
    create: { userId, messageId, ...data },
    update: data,
  });
}

export type ChatFeedbackRow = {
  id: number;
  userId: string;
  userName: string;
  agentId: string;
  sessionKey: string;
  rating: number;
  reason: string | null;
  updatedAt: string;
};

/** Newest answer ratings across all users, for the superUser page. */
export async function getChatFeedback(limit = 200): Promise<ChatFeedbackRow[]> {
  try {
    const rows = await prisma.chatFeedback.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: { user: { select: { name: true } } },
    });

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      userName: row.user.name,
      agentId: row.agentId,
      sessionKey: row.sessionKey,
      rating: row.rating,
      reason: row.reason,
      updatedAt: row.updatedAt.toISOString(),
    }));
  } catch (cause) {
    // P2021 = table missing: the ChatFeedback migration is not applied yet.
    // The rest of the page must still load.
    if ((cause as { code?: string }).code === "P2021") return [];
    throw cause;
  }
}
