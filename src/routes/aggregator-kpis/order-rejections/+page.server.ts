import { requirePermission } from "$lib/server/auth-guards";
import {
  listStores,
  parseKpiFilters,
} from "$lib/services/aggregator-kpis/kpi-shared.server";
import { getRejectionsView } from "$lib/services/aggregator-kpis/order-rejections.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { aggregatorKpis: ["view"] });

  const filters = parseKpiFilters(event.url.searchParams);

  const [view, stores] = await Promise.all([
    getRejectionsView(filters),
    listStores(null),
  ]);

  return { filters, stores, view };
};
