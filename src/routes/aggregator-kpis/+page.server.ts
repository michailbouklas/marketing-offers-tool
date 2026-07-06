import { requirePermission } from "$lib/server/auth-guards";
import { getDashboardStats } from "$lib/services/aggregator-kpis/dashboard.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { aggregatorKpis: ["view"] });

  return {
    stats: await getDashboardStats(),
  };
};
