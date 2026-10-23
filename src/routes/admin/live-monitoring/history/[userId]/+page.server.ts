import { error } from "@sveltejs/kit";
import { requireSuperUser } from "$lib/server/auth-guards";
import {
  getUserHistory,
  parseHistoryRange,
} from "$lib/services/page-views/page-view-history.server";
import type { PageServerLoad } from "./$types";

/**
 * SuperUser-only drill-down: everything one user visited in the range,
 * grouped by day and route, with exact paths while raw rows are retained.
 */
export const load: PageServerLoad = async (event) => {
  await requireSuperUser(event);

  const range = parseHistoryRange(event.url);
  const history = await getUserHistory(event.params.userId, range);

  if (!history) {
    error(404, "User not found");
  }

  return { range, history };
};
