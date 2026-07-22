import { error, json } from "@sveltejs/kit";
import { toAISdkMessages } from "@mastra/ai-sdk/ui";
import { requireApiSuperUser } from "$lib/server/auth-guards";
import { getMastra } from "$lib/server/mastra";
import type { ChatConversationMessage } from "$lib/services/chat-usage";
import {
  getChatThreadById,
  getRawThreadMessages,
  parseThreadId,
} from "$lib/services/chat-usage.server";
import type { RequestHandler } from "./$types";

/**
 * SuperUser-only read of a full conversation for the `/admin/chat-usage`
 * dialog. Prefers Mastra's own recall (normalized UIMessage parts, same shape
 * the chat widget renders); falls back to parsing the stored message JSON for
 * threads whose agent is no longer registered.
 */
export const GET: RequestHandler = async (event) => {
  await requireApiSuperUser(event);

  const threadId = event.url.searchParams.get("threadId") ?? "";
  const parsed = parseThreadId(threadId);

  if (!parsed) {
    error(400, "Invalid thread id");
  }

  const thread = await getChatThreadById(threadId);

  if (!thread) {
    error(404, "Conversation not found");
  }

  let messages: ChatConversationMessage[];

  try {
    const memory = await getMastra().getAgentById(parsed.agentId).getMemory();

    if (!memory) {
      throw new Error("Agent has no memory configured");
    }

    const recalled = await memory.recall({
      threadId,
      // The view's resourceId is authoritative — not the id-embedded segment.
      resourceId: thread.resourceId,
    });

    messages = toAISdkMessages(recalled?.messages ?? [], {
      version: "v6",
    }) as ChatConversationMessage[];
  } catch {
    messages = await getRawThreadMessages(threadId);
  }

  return json({
    thread: {
      id: thread.id,
      title: thread.title,
      agentId: parsed.agentId,
      userId: thread.resourceId,
      updatedAt: thread.updatedAt ? thread.updatedAt.toISOString() : null,
    },
    messages,
  });
};
