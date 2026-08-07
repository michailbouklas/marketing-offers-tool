import { requirePermission } from "$lib/server/auth-guards";
import { loadPeriodScope } from "$lib/services/aggregator-kpis/period-shared.server";
import { getRatingsFoodyView } from "$lib/services/aggregator-kpis/ratings.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { aggregatorKpis: ["view"] });

  const { filters, aggregator, brands, stores } = await loadPeriodScope(event);

  // Ratings/reviews are not scraped for Wolt yet.
  if (aggregator === "WOLT") {
    return {
      filters,
      aggregator,
      brands,
      stores,
      unavailableForWolt: true,
      view: { rows: [], trend: [], distribution: [] },
    };
  }

  const view = await getRatingsFoodyView(filters);

  return {
    filters,
    aggregator,
    brands,
    stores,
    unavailableForWolt: false,
    view,
  };
};
