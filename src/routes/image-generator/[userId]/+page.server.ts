import { error } from "@sveltejs/kit";
import { requireSuperUser } from "$lib/server/auth-guards";
import { loadGenerationsHistory } from "$lib/server/generations-history";
import { getUserSummaryById } from "$lib/services/users.server";
import type { PageServerLoad } from "./$types";

/**
 * Super-user drill-down into another user's generation history. Mirrors
 * `/image-generator/me` but scoped to the target user; reserved for the
 * `superUser` role (linked from the admin usage dashboard's
 * "Most active users" table).
 */
export const load: PageServerLoad = async (event) => {
  await requireSuperUser(event);

  const targetUser = await getUserSummaryById(event.params.userId);

  if (!targetUser) {
    error(404, "User not found");
  }

  const history = await loadGenerationsHistory(event.url, targetUser.id);

  return {
    ...history,
    targetUser,
  };
};
