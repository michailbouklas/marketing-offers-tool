import { error } from "@sveltejs/kit";
import { requireSuperUser } from "$lib/server/auth-guards";
import { getUserChatsByAgent } from "$lib/services/chat-usage.server";
import { getUserSummaryById } from "$lib/services/users.server";
import type { PageServerLoad } from "./$types";

/**
 * SuperUser drill-down into one user's AI conversations, grouped per agent.
 * A deleted account may still have stored chats, so the page only 404s when
 * neither the user nor any of their threads exist.
 */
export const load: PageServerLoad = async (event) => {
  await requireSuperUser(event);

  const [targetUser, agentGroups] = await Promise.all([
    getUserSummaryById(event.params.userId),
    getUserChatsByAgent(event.params.userId),
  ]);

  if (!targetUser && agentGroups.length === 0) {
    error(404, "User not found");
  }

  return {
    targetUser,
    targetUserId: event.params.userId,
    agentGroups,
  };
};
