import { requirePermission } from "$lib/server/auth-guards";
import { listStores } from "$lib/services/aggregator-kpis/kpi-shared.server";
import {
  parsePeriodFilters,
  resolveAggregator,
} from "$lib/services/aggregator-kpis/period-shared.server";
import { getRatingsFoodyView } from "$lib/services/aggregator-kpis/ratings.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { aggregatorKpis: ["view"] });

  const filters = parsePeriodFilters(event.url.searchParams);
  const aggregator = resolveAggregator(event);
  const stores = await listStores(aggregator);

  // Ratings/reviews are not scraped for Wolt yet.
  if (aggregator === "WOLT") {
    return {
      filters,
      aggregator,
      stores,
      unavailableForWolt: true,
      view: { rows: [], trend: [], distribution: [] },
    };
  }

  const view = await getRatingsFoodyView(filters.storeId);

  return { filters, aggregator, stores, unavailableForWolt: false, view };
};
