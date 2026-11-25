import { error, json } from "@sveltejs/kit";
import { hasAnyRole, superUserRole } from "$lib/auth/roles";
import { getAuthenticatedUserRole } from "$lib/server/auth-guards";
import { authorizeAgent } from "$lib/server/chat-thread";
import {
  CHAT_PROMPT_MAX_LENGTH,
  CHAT_PROMPTS_PER_USER_PER_AGENT,
  createChatPrompt,
  deleteChatPrompt,
  listChatPrompts,
  setChatPromptPublished,
} from "$lib/services/chat-prompts.server";
import { z } from "zod";
import type { RequestEvent, RequestHandler } from "./$types";

const agentId = z.string().min(1).max(100);
const id = z.coerce.number().int().positive();

const listSchema = z.object({ agentId });
const createSchema = z.object({
  agentId,
  text: z.string().trim().min(1).max(CHAT_PROMPT_MAX_LENGTH),
});
const publishSchema = z.object({ agentId, id, published: z.boolean() });
const deleteSchema = z.object({ agentId, id });

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    error(400, "Invalid prompt request");
  }
  return parsed.data;
}

function query(event: RequestEvent) {
  return Object.fromEntries(event.url.searchParams);
}

function body(event: RequestEvent) {
  return event.request.json().catch(() => null);
}

async function isSuperUser(event: RequestEvent) {
  return hasAnyRole(await getAuthenticatedUserRole(event), [superUserRole]);
}

/** Starter prompts for one agent: the published ones plus the caller's own. */
export const GET: RequestHandler = async (event) => {
  const input = parse(listSchema, query(event));
  const { user } = await authorizeAgent(event, input.agentId);
  const canPublish = await isSuperUser(event);

  try {
    return json({
      prompts: await listChatPrompts(input.agentId, user.id),
      canPublish,
    });
  } catch (cause) {
    // Never fails the chat. P2021 = the ChatPrompt table is not migrated yet.
    if ((cause as { code?: string } | null)?.code !== "P2021") {
      console.error("[ai-chat] listing starter prompts failed", cause);
    }
    return json({ prompts: [], canPublish });
  }
};

export const POST: RequestHandler = async (event) => {
  const input = parse(createSchema, await body(event));
  const { user } = await authorizeAgent(event, input.agentId);

  const prompt = await createChatPrompt(input.agentId, user.id, input.text);
  if (!prompt) {
    error(
      409,
      `You can save up to ${CHAT_PROMPTS_PER_USER_PER_AGENT} prompts per assistant`,
    );
  }

  return json({ prompt }, { status: 201 });
};

/** Publish or unpublish: superUsers only, and only their own prompts. */
export const PATCH: RequestHandler = async (event) => {
  const input = parse(publishSchema, await body(event));
  const { user } = await authorizeAgent(event, input.agentId);

  if (!(await isSuperUser(event))) {
    error(403, "Forbidden");
  }

  if (
    !(await setChatPromptPublished(
      input.agentId,
      user.id,
      input.id,
      input.published,
    ))
  ) {
    error(404, "Prompt not found");
  }

  return new Response(null, { status: 204 });
};

/** Own prompts; superUsers may also delete any published prompt. */
export const DELETE: RequestHandler = async (event) => {
  const input = parse(deleteSchema, query(event));
  const { user } = await authorizeAgent(event, input.agentId);

  if (
    !(await deleteChatPrompt(
      input.agentId,
      user.id,
      input.id,
      await isSuperUser(event),
    ))
  ) {
    error(404, "Prompt not found");
  }

  return new Response(null, { status: 204 });
};
