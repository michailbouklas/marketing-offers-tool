import { requireAdminUser } from "$lib/server/auth-guards";
import {
  getSessionsView,
  parseSessionFilters,
} from "$lib/services/aggregator-kpis/sessions.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  // Tighter than the section's `aggregatorKpis: ["view"]` permission — this
  // route is restricted to admin + superUser only.
  await requireAdminUser(event);

  const filters = parseSessionFilters(event.url.searchParams);
  const view = await getSessionsView(filters);

  return { filters, view };
};
