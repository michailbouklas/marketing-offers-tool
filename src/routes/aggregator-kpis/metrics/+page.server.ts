import { requirePermission } from "$lib/server/auth-guards";
import { listStores } from "$lib/services/aggregator-kpis/kpi-shared.server";
import { getMetricsView } from "$lib/services/aggregator-kpis/metrics.server";
import { parsePeriodFilters } from "$lib/services/aggregator-kpis/period-shared.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { aggregatorKpis: ["view"] });

  const filters = parsePeriodFilters(event.url.searchParams);

  const [view, stores] = await Promise.all([
    getMetricsView(filters),
    listStores("FOODY"),
  ]);

  return { filters, stores, view };
};
