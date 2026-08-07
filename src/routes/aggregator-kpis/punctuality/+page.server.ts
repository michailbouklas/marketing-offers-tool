import { requirePermission } from "$lib/server/auth-guards";
import { loadPeriodScope } from "$lib/services/aggregator-kpis/period-shared.server";
import { getPunctualityPeriodView } from "$lib/services/aggregator-kpis/punctuality.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { aggregatorKpis: ["view"] });

  const { filters, aggregator, brands, stores } = await loadPeriodScope(event);

  // Wolt has no punctuality section — the analogs (late-orders, prep-time) live
  // on the rejections KPI. Show an empty state instead of Foody data.
  if (aggregator === "WOLT") {
    return {
      filters,
      aggregator,
      brands,
      stores,
      unavailableForWolt: true,
      view: { period: filters.period, rows: [], trend: [] },
    };
  }

  const view = await getPunctualityPeriodView(filters);

  return {
    filters,
    aggregator,
    brands,
    stores,
    unavailableForWolt: false,
    view,
  };
};
