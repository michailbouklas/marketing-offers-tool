import { requirePermission } from "$lib/server/auth-guards";
import { listStores } from "$lib/services/aggregator-kpis/kpi-shared.server";
import { getPunctualityPeriodView } from "$lib/services/aggregator-kpis/punctuality.server";
import {
  parsePeriodFilters,
  resolveAggregator,
} from "$lib/services/aggregator-kpis/period-shared.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { aggregatorKpis: ["view"] });

  const filters = parsePeriodFilters(event.url.searchParams);
  const aggregator = resolveAggregator(event);
  const stores = await listStores(aggregator);

  // Wolt has no punctuality section — the analogs (late-orders, prep-time) live
  // on the rejections KPI. Show an empty state instead of Foody data.
  if (aggregator === "WOLT") {
    return {
      filters,
      aggregator,
      stores,
      unavailableForWolt: true,
      view: { period: filters.period, rows: [], trend: [] },
    };
  }

  const view = await getPunctualityPeriodView(filters);

  return { filters, aggregator, stores, unavailableForWolt: false, view };
};
