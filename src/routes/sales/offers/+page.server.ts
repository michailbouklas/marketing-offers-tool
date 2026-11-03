import { redirect } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/auth-guards";
import { resolveSalesDashboardScope } from "$lib/services/sales-dashboard.server";
import { withSingleBrand } from "$lib/services/sales-dashboard";
import {
  getCachedOfferValues,
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
  const cached = await getCachedOfferValues(brand);

  return {
    scope: { brands: scope.brands, filters },
    // Cache miss (never computed): stream the first build; it takes seconds.
    offers:
      cached ??
      refreshOfferValues(brand).then(() => getCachedOfferValues(brand)),
  };
};
