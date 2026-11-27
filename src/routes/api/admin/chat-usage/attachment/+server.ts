import { error } from "@sveltejs/kit";
import { requireApiSuperUser } from "$lib/server/auth-guards";
import {
  attachmentPrefix,
  attachmentResponse,
  readAttachment,
} from "$lib/server/mastra/processors/chat-attachments";
import {
  getChatThreadById,
  parseThreadId,
} from "$lib/services/chat-usage.server";
import type { RequestHandler } from "./$types";

/**
 * SuperUser-only read of one stored attachment of any user's conversation,
 * for the `/admin/chat-usage` dialog. The owner comes from the stored thread,
 * and `readAttachment` only resolves server-generated refs.
 */
export const GET: RequestHandler = async (event) => {
  await requireApiSuperUser(event);

  const threadId = event.url.searchParams.get("threadId") ?? "";
  const ref = event.url.searchParams.get("ref") ?? "";
  const parsed = parseThreadId(threadId);

  if (!parsed) {
    error(400, "Invalid thread id");
  }

  const thread = await getChatThreadById(threadId);

  if (!thread) {
    error(404, "Conversation not found");
  }

  const file = await readAttachment(
    attachmentPrefix(thread.resourceId, parsed.agentId, parsed.sessionKey),
    ref,
  );

  if (!file) {
    error(404, "Attachment not found");
  }

  return attachmentResponse(file);
};
