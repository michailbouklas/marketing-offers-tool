import { requirePermission } from "$lib/server/auth-guards";
import { listStores } from "$lib/services/aggregator-kpis/kpi-shared.server";
import { getProGrowthPeriodView } from "$lib/services/aggregator-kpis/pro-growth.server";
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

  // Foody Pro is a Foody-only programme — no Wolt equivalent.
  if (aggregator === "WOLT") {
    return {
      filters,
      aggregator,
      stores,
      unavailableForWolt: true,
      view: {
        period: filters.period,
        rows: [],
        proShareTrend: [],
        newShareTrend: [],
      },
    };
  }

  const view = await getProGrowthPeriodView(filters);

  return { filters, aggregator, stores, unavailableForWolt: false, view };
};
