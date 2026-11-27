import { error } from "@sveltejs/kit";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import {
  attachmentPrefix,
  attachmentResponse,
  readAttachment,
} from "$lib/server/mastra/processors/chat-attachments";
import { z } from "zod";
import type { RequestHandler } from "./$types";

const querySchema = z.object({
  // Path segments of the storage key: no separators or dots.
  agentId: z.string().regex(/^[a-z0-9-]+$/),
  session: z.uuid(),
  ref: z.string(),
});

/**
 * Serves one stored chat attachment to its owner (thumbnails / chips in the
 * chat UI). The storage prefix is built from the session user, so a caller
 * can only ever read their own conversations' files.
 */
export const GET: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);
  const query = querySchema.safeParse(
    Object.fromEntries(event.url.searchParams),
  );

  if (!query.success) {
    error(400, "Invalid attachment request");
  }

  const file = await readAttachment(
    attachmentPrefix(user.id, query.data.agentId, query.data.session),
    query.data.ref,
  );

  if (!file) {
    error(404, "Attachment not found");
  }

  return attachmentResponse(file);
};
