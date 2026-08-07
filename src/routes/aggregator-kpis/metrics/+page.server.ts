import { requirePermission } from "$lib/server/auth-guards";
import { getMetricsView } from "$lib/services/aggregator-kpis/metrics.server";
import { loadPeriodScope } from "$lib/services/aggregator-kpis/period-shared.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { aggregatorKpis: ["view"] });

  const { filters, aggregator, brands, stores } = await loadPeriodScope(event);
  const view = await getMetricsView(filters, aggregator);

  return { filters, aggregator, brands, stores, view };
};
