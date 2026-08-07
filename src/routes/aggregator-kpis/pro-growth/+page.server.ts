import { requirePermission } from "$lib/server/auth-guards";
import { loadPeriodScope } from "$lib/services/aggregator-kpis/period-shared.server";
import { getProGrowthPeriodView } from "$lib/services/aggregator-kpis/pro-growth.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { aggregatorKpis: ["view"] });

  const { filters, aggregator, brands, stores } = await loadPeriodScope(event);

  // Foody Pro is a Foody-only programme — no Wolt equivalent.
  if (aggregator === "WOLT") {
    return {
      filters,
      aggregator,
      brands,
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

  return {
    filters,
    aggregator,
    brands,
    stores,
    unavailableForWolt: false,
    view,
  };
};
