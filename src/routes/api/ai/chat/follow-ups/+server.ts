import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { suggestFollowUps } from "$lib/services/chat-follow-ups.server";
import { ASSISTANT_IDS } from "$lib/services/skills/assistants";
import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";

const bodySchema = z.object({
  agentId: z.enum(ASSISTANT_IDS),
  question: z.string().trim().min(1).max(2_000),
  answer: z.string().trim().min(1).max(4_000),
});

/**
 * Follow-up question suggestions for the exchange the chat UI just showed.
 * Works only on the text the caller sends (their own conversation) and reads
 * no data, so any signed-in user may call it. Never fails the chat: errors
 * come back as an empty list.
 */
export const POST: RequestHandler = async (event) => {
  requireAuthenticatedApiUser(event);

  const parsed = bodySchema.safeParse(
    await event.request.json().catch(() => null),
  );
  if (!parsed.success) {
    error(400, "Invalid follow-ups request");
  }

  try {
    return json({ suggestions: await suggestFollowUps(parsed.data) });
  } catch (cause) {
    console.error("[ai-chat] follow-up suggestions failed", cause);
    return json({ suggestions: [] });
  }
};
