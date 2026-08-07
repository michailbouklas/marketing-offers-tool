import { requirePermission } from "$lib/server/auth-guards";
import { withBrandStores } from "$lib/services/aggregator-kpis/brand-stores.server";
import { getDashboardStats } from "$lib/services/aggregator-kpis/dashboard.server";
import { parsePeriodFilters } from "$lib/services/aggregator-kpis/period-shared.server";
import { listBrands } from "$lib/services/brands.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { aggregatorKpis: ["view"] });

  // The dashboard summarizes both platforms at once, so the brand scope spans
  // every aggregator (null) rather than the cookie's current one.
  const [filters, brands] = await Promise.all([
    withBrandStores(parsePeriodFilters(event.url.searchParams), null),
    listBrands({ active: true }),
  ]);

  return {
    filters,
    brands,
    stats: await getDashboardStats(filters),
  };
};
