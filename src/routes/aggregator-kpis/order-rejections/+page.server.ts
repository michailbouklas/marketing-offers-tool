import { requirePermission } from "$lib/server/auth-guards";
import { getRejectionsPeriodView } from "$lib/services/aggregator-kpis/order-rejections.server";
import { loadPeriodScope } from "$lib/services/aggregator-kpis/period-shared.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { aggregatorKpis: ["view"] });

  const { filters, aggregator, brands, stores } = await loadPeriodScope(event);
  const view = await getRejectionsPeriodView(filters, aggregator);

  return { filters, aggregator, brands, stores, view };
};
