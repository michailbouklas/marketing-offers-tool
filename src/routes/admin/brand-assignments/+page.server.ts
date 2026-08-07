import { requirePermission } from "$lib/server/auth-guards";
import { parseAggregatorValue } from "$lib/services/aggregator-kpis/aggregator-cookie";
import { listAggregatorStoreAssignments } from "$lib/services/aggregator-kpis/brand-stores.server";
import { listBrands } from "$lib/services/brands.server";
import type { PageServerLoad } from "./$types";

/**
 * Store → brand assignment tool. A physical restaurant is scraped separately on
 * each platform, with unrelated external ids, so grouping those rows under a
 * brand is what lets the KPI section report on "KFC" rather than on each
 * storefront.
 *
 * Gated on `brand: ["manage"]`, so `superUser`, `brandManager`, and `admin` may
 * reach it. Mutations are served by `/api/admin/brand-entities`.
 *
 * The platform comes from a URL param rather than the `kpi_aggregator` cookie:
 * this is an admin tool, and reusing the cookie would silently change which
 * platform the admin's own KPI pages show.
 */
export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { brand: ["manage"] });

  const aggregator = parseAggregatorValue(
    event.url.searchParams.get("aggregator"),
  );

  const [brands, rows] = await Promise.all([
    listBrands({ active: true }),
    listAggregatorStoreAssignments(aggregator),
  ]);

  return { aggregator, brands, rows };
};
