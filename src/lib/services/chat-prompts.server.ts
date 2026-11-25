import { prisma } from "$lib/server/prisma";

export const CHAT_PROMPT_MAX_LENGTH = 500;
export const CHAT_PROMPTS_PER_USER_PER_AGENT = 20;

/** A starter prompt as the chat UI sees it; `mine` replaces the owner's id. */
export interface ChatPromptItem {
  id: number;
  text: string;
  published: boolean;
  mine: boolean;
}

/** Team (published) prompts first, then the caller's own; oldest first. */
export async function listChatPrompts(
  agentId: string,
  userId: string,
): Promise<ChatPromptItem[]> {
  const rows = await prisma.chatPrompt.findMany({
    where: { agentId, OR: [{ published: true }, { userId }] },
    orderBy: [{ published: "desc" }, { createdAt: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    published: row.published,
    mine: row.userId === userId,
  }));
}

/** Returns null when the caller already holds the per-agent maximum. */
export async function createChatPrompt(
  agentId: string,
  userId: string,
  text: string,
): Promise<ChatPromptItem | null> {
  // shortcut: count-then-create can overshoot the cap by a few under parallel requests, add a transaction if the cap ever has to be exact
  const owned = await prisma.chatPrompt.count({ where: { agentId, userId } });
  if (owned >= CHAT_PROMPTS_PER_USER_PER_AGENT) {
    return null;
  }

  const row = await prisma.chatPrompt.create({
    data: { agentId, userId, text },
  });

  return { id: row.id, text: row.text, published: row.published, mine: true };
}

/** Publishes or unpublishes one of the caller's own prompts. False when not found. */
export async function setChatPromptPublished(
  agentId: string,
  userId: string,
  id: number,
  published: boolean,
) {
  const { count } = await prisma.chatPrompt.updateMany({
    where: { id, agentId, userId },
    data: { published },
  });

  return count > 0;
}

/**
 * Deletes the caller's own prompt, or any published one when the caller may
 * moderate team prompts. False when nothing matched.
 */
export async function deleteChatPrompt(
  agentId: string,
  userId: string,
  id: number,
  canModerate: boolean,
) {
  const { count } = await prisma.chatPrompt.deleteMany({
    where: {
      id,
      agentId,
      OR: [{ userId }, ...(canModerate ? [{ published: true }] : [])],
    },
  });

  return count > 0;
}
