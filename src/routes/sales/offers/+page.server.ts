import { redirect } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/auth-guards";
import { resolveSalesDashboardScope } from "$lib/services/sales-dashboard.server";
import { withSingleBrand } from "$lib/services/sales-dashboard";
import { parseOfferDateRange } from "$lib/services/sales-offers";
import {
  getCachedOfferValues,
  getOfferValuesForRange,
  refreshOfferValues,
} from "$lib/services/sales-offers.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { user } = await requirePermission(event, { sales: ["view"] });
  if (!user) redirect(302, "/login");
  const scope = await resolveSalesDashboardScope(event, user.id);

  if (!scope) {
    return { scope: null };
  }

  const filters = withSingleBrand(scope.filters);
  const brand = filters.brands[0];
  // The scope defaults to the last 30 days; this page defaults to all time.
  const range = parseOfferDateRange(event.url.searchParams);

  if (range) {
    return {
      scope: { brands: scope.brands, filters },
      range,
      offers: getOfferValuesForRange(brand, range),
    };
  }

  const cached = await getCachedOfferValues(brand);

  return {
    scope: { brands: scope.brands, filters },
    range,
    // Cache miss (never computed): stream the first build; it takes seconds.
    offers:
      cached ??
      refreshOfferValues(brand).then(() => getCachedOfferValues(brand)),
  };
};
