import { redirect } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/auth-guards";
import { resolveSalesDashboardScope } from "$lib/services/sales-dashboard.server";
import {
  EXPLORE_COLUMNS_PREFERENCE,
  exploreColumnStateSchema,
} from "$lib/services/sales-explore";
import { getUserPreference } from "$lib/services/user-preferences.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { user } = await requirePermission(event, { sales: ["view"] });
  if (!user) redirect(302, "/login");
  const [scope, savedColumns] = await Promise.all([
    resolveSalesDashboardScope(event, user.id),
    getUserPreference(user.id, EXPLORE_COLUMNS_PREFERENCE),
  ]);
  // A stale or hand-edited layout is ignored rather than breaking the grid.
  const columns = exploreColumnStateSchema.safeParse(savedColumns);
  return { scope, columnState: columns.success ? columns.data : null };
};
