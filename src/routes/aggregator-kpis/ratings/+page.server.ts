import { requirePermission } from "$lib/server/auth-guards";
import {
  listStores,
  parseKpiFilters,
} from "$lib/services/aggregator-kpis/kpi-shared.server";
import { getRatingsView } from "$lib/services/aggregator-kpis/ratings.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { aggregatorKpis: ["view"] });

  const filters = parseKpiFilters(event.url.searchParams);

  const [view, stores] = await Promise.all([
    getRatingsView(filters),
    listStores(null),
  ]);

  return { filters, stores, view };
};
