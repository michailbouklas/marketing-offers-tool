import { requirePermission } from "$lib/server/auth-guards";
import { getClosuresPeriodView } from "$lib/services/aggregator-kpis/closures.server";
import { listStores } from "$lib/services/aggregator-kpis/kpi-shared.server";
import {
  parsePeriodFilters,
  resolveAggregator,
} from "$lib/services/aggregator-kpis/period-shared.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { aggregatorKpis: ["view"] });

  const filters = parsePeriodFilters(event.url.searchParams);
  const aggregator = resolveAggregator(event);

  const [view, stores] = await Promise.all([
    getClosuresPeriodView(filters, aggregator),
    listStores(aggregator),
  ]);

  return { filters, aggregator, stores, view };
};
