import { requireSuperUser } from "$lib/server/auth-guards";
import {
  getVisitorSummary,
  parseHistoryRange,
} from "$lib/services/page-views/page-view-history.server";
import type { PageServerLoad } from "./$types";

/**
 * SuperUser-only list of everyone who used the tool in a date range (default:
 * the last 30 days): last visit, visits (30-minute gap rule), page views and
 * foreground time.
 */
export const load: PageServerLoad = async (event) => {
  await requireSuperUser(event);

  const range = parseHistoryRange(event.url);

  return {
    range,
    visitors: await getVisitorSummary(range),
  };
};
