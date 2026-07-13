import { requirePermission } from "$lib/server/auth-guards";
import { getClosuresPeriodView } from "$lib/services/aggregator-kpis/closures.server";
import { listStores } from "$lib/services/aggregator-kpis/kpi-shared.server";
import { parsePeriodFilters } from "$lib/services/aggregator-kpis/period-shared.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { aggregatorKpis: ["view"] });

  const filters = parsePeriodFilters(event.url.searchParams);

  const [view, stores] = await Promise.all([
    getClosuresPeriodView(filters),
    listStores("FOODY"),
  ]);

  return { filters, stores, view };
};
