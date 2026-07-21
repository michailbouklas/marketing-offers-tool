import { error, json } from "@sveltejs/kit";
import { handleChatStream } from "@mastra/ai-sdk";
import { toAISdkMessages } from "@mastra/ai-sdk/ui";
import { createUIMessageStreamResponse } from "ai";
import { requireApiPermission } from "$lib/server/auth-guards";
import { getMastra } from "$lib/server/mastra";
import { chatAgents } from "$lib/server/mastra/chat-registry";
import { z } from "zod";
import type { RequestEvent, RequestHandler } from "./$types";

const sessionKeySchema = z.uuid();

/**
 * Shape sent by the chat widget's DefaultChatTransport: the UIMessage history
 * plus the section-specific agent id and the client-chosen session key.
 * Messages are passed through to Mastra as-is (it validates the UIMessage
 * format), so only the envelope is checked.
 */
const requestSchema = z.object({
  agentId: z.string(),
  sessionKey: sessionKeySchema,
  messages: z.array(z.record(z.string(), z.unknown())).min(1),
});

/**
 * Memory thread ids are namespaced server-side per agent AND user, so a
 * client-supplied session key can only ever address the caller's own
 * conversations. "Clearing" the window is just switching to a fresh key —
 * previous threads stay in storage and remain recallable.
 */
function threadIdFor(agentId: string, userId: string, sessionKey: string) {
  return `${agentId}:${userId}:${sessionKey}`;
}

async function authorizeAgent(event: RequestEvent, agentId: string) {
  const agent = chatAgents[agentId];

  if (!agent) {
    error(400, `Unknown chat agent "${agentId}"`);
  }

  return requireApiPermission(event, agent.permissions);
}

export const POST: RequestHandler = async (event) => {
  const body = requestSchema.safeParse(
    await event.request.json().catch(() => null),
  );

  if (!body.success) {
    error(400, "Invalid chat request");
  }

  const { agentId, sessionKey } = body.data;
  const { user } = await authorizeAgent(event, agentId);

  const stream = await handleChatStream({
    mastra: getMastra(),
    agentId,
    version: "v6",
    params: {
      // Cast: the zod pass-through type is looser than Mastra's UIMessage.
      messages: body.data.messages as never,
      maxSteps: 8,
      memory: {
        thread: threadIdFor(agentId, user.id, sessionKey),
        resource: user.id,
      },
    },
  });

  return createUIMessageStreamResponse({ stream });
};

export type ChatSessionSummary = {
  key: string;
  title: string;
  updatedAt: string | null;
};

/**
 * Without `session`: lists the user's stored conversations for an agent
 * (newest first) so the widget can render a history menu. With `session`:
 * returns that conversation's messages as AI SDK UIMessages, rendered as-is.
 */
export const GET: RequestHandler = async (event) => {
  const agentId = event.url.searchParams.get("agentId") ?? "";
  const sessionParam = event.url.searchParams.get("session");
  const { user } = await authorizeAgent(event, agentId);

  const memory = await getMastra().getAgentById(agentId).getMemory();

  if (!memory) {
    return json(sessionParam ? [] : { sessions: [] });
  }

  if (sessionParam) {
    const sessionKey = sessionKeySchema.safeParse(sessionParam);

    if (!sessionKey.success) {
      error(400, "Invalid session key");
    }

    try {
      const recalled = await memory.recall({
        threadId: threadIdFor(agentId, user.id, sessionKey.data),
        resourceId: user.id,
      });

      return json(toAISdkMessages(recalled?.messages ?? [], { version: "v6" }));
    } catch {
      // Unknown/empty thread — an empty conversation, not an error.
      return json([]);
    }
  }

  const threadPrefix = threadIdFor(agentId, user.id, "");
  const { threads } = await memory.listThreads({
    filter: { resourceId: user.id },
    perPage: false,
  });

  const sessions: ChatSessionSummary[] = threads
    .filter((thread) => thread.id.startsWith(threadPrefix))
    .map((thread) => ({
      key: thread.id.slice(threadPrefix.length),
      title: thread.title || "Untitled conversation",
      updatedAt: thread.updatedAt
        ? new Date(thread.updatedAt).toISOString()
        : null,
    }))
    .sort((left, right) =>
      (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""),
    );

  return json({ sessions });
};
