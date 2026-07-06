import { requirePermission } from "$lib/server/auth-guards";
import { getClosuresView } from "$lib/services/aggregator-kpis/closures.server";
import {
  listStores,
  parseKpiFilters,
} from "$lib/services/aggregator-kpis/kpi-shared.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { aggregatorKpis: ["view"] });

  const filters = parseKpiFilters(event.url.searchParams);

  const [view, stores] = await Promise.all([
    getClosuresView(filters),
    listStores(null),
  ]);

  return { filters, stores, view };
};
