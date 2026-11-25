import { error, json } from "@sveltejs/kit";
import { getMastra } from "$lib/server/mastra";
import { z } from "zod";
import { authorizeAgent, threadIdFor } from "$lib/server/chat-thread";
import type { RequestHandler } from "./$types";

const patchSchema = z
  .object({
    agentId: z.string(),
    session: z.uuid(),
    title: z.string().trim().min(1).max(200).optional(),
    pinned: z.boolean().optional(),
  })
  .refine((body) => body.title !== undefined || body.pinned !== undefined);

/**
 * Renames and/or pins one of the caller's own stored conversations. Both live
 * on the Mastra thread (title, `metadata.pinned`). The thread id is namespaced
 * per agent + user (threadIdFor), so a client key can never address another
 * user's thread.
 */
export const PATCH: RequestHandler = async (event) => {
  const body = patchSchema.safeParse(
    await event.request.json().catch(() => null),
  );

  if (!body.success) {
    error(400, "Invalid session update");
  }

  const { agentId, session, title, pinned } = body.data;
  const { user } = await authorizeAgent(event, agentId);

  const memory = await getMastra().getAgentById(agentId).getMemory();
  const thread = await memory?.getThreadById({
    threadId: threadIdFor(agentId, user.id, session),
  });

  if (!memory || !thread || thread.resourceId !== user.id) {
    error(404, "Conversation not found");
  }

  // saveThread, not updateThread: the latter bumps updatedAt, which would move
  // a renamed or pinned conversation to the top of the date groups.
  const saved = await memory.saveThread({
    thread: {
      ...thread,
      title: title ?? thread.title,
      metadata:
        pinned === undefined ? thread.metadata : { ...thread.metadata, pinned },
    },
  });

  return json({
    key: session,
    title: saved.title || "Untitled conversation",
    pinned: saved.metadata?.pinned === true,
  });
};
