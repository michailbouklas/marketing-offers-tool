import { error, json, type RequestEvent } from "@sveltejs/kit";
import { isShareableAgent } from "$lib/components/ai-chat/chat-share";
import { getAuthenticatedUserRole } from "$lib/server/auth-guards";
import { authorizeAgent, threadIdFor } from "$lib/server/chat-thread";
import { getMastra } from "$lib/server/mastra";
import { chatAgents } from "$lib/server/mastra/chat-registry";
import {
  createShare,
  isMissingTable,
  revokeShare,
} from "$lib/services/chat-share.server";
import { z } from "zod";
import type { RequestHandler } from "./$types";

const bodySchema = z.object({
  agentId: z.string(),
  sessionKey: z.uuid(),
});

async function parse(event: RequestEvent) {
  const body = bodySchema.safeParse(
    await event.request.json().catch(() => null),
  );

  if (!body.success) {
    error(400, "Invalid share request");
  }

  return body.data;
}

function unavailable(cause: unknown): never {
  if (isMissingTable(cause)) {
    error(503, "Sharing is not available yet.");
  }

  throw cause;
}

/**
 * Creates the read-only share link of one of the caller's own conversations,
 * or returns the existing one. The thread id is namespaced per agent + user
 * (threadIdFor), so only the caller's own conversation can be shared.
 */
export const POST: RequestHandler = async (event) => {
  const { agentId, sessionKey } = await parse(event);
  const { user } = await authorizeAgent(event, agentId);

  if (!isShareableAgent(chatAgents[agentId])) {
    error(400, "Conversations with this assistant cannot be shared.");
  }

  const memory = await getMastra().getAgentById(agentId).getMemory();
  const thread = await memory?.getThreadById({
    threadId: threadIdFor(agentId, user.id, sessionKey),
  });

  if (!thread || thread.resourceId !== user.id) {
    error(404, "Conversation not found");
  }

  const share = await createShare(
    { id: user.id, role: await getAuthenticatedUserRole(event) },
    agentId,
    sessionKey,
  ).catch(unavailable);

  return json({ id: share.id });
};

/** Stops sharing one of the caller's own conversations. Idempotent. */
export const DELETE: RequestHandler = async (event) => {
  const { agentId, sessionKey } = await parse(event);
  const { user } = await authorizeAgent(event, agentId);

  await revokeShare(user.id, agentId, sessionKey).catch(unavailable);

  return new Response(null, { status: 204 });
};
