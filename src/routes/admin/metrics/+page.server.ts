import { requirePermission } from "$lib/server/auth-guards";
import { getUserLoginMetrics } from "$lib/services/user-metrics.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  // /admin hooks gate enforces admin; this additionally requires the metrics
  // capability, which only superUser holds today.
  await requirePermission(event, { metrics: ["view"] });

  return {
    metrics: await getUserLoginMetrics(),
  };
};
