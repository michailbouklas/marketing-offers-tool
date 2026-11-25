import { error } from "@sveltejs/kit";
import { authorizeAgent } from "$lib/server/chat-thread";
import { saveChatFeedback } from "$lib/services/chat-usage.server";
import { z } from "zod";
import type { RequestHandler } from "./$types";

const bodySchema = z.object({
  agentId: z.string(),
  sessionKey: z.uuid(),
  messageId: z.string().min(1).max(200),
  rating: z.union([z.literal(1), z.literal(-1)]),
  reason: z.string().trim().max(2000).optional(),
});

/**
 * Thumbs up/down on one assistant answer. One row per (user, message), so
 * rating again overwrites. Same gate as the chat itself: the caller must be
 * allowed to use the agent.
 */
export const POST: RequestHandler = async (event) => {
  const body = bodySchema.safeParse(
    await event.request.json().catch(() => null),
  );
  if (!body.success) {
    error(400, "Invalid feedback request");
  }

  const { user } = await authorizeAgent(event, body.data.agentId);
  await saveChatFeedback(user.id, body.data);

  return new Response(null, { status: 204 });
};
