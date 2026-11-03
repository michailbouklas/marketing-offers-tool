import { redirect } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/auth-guards";
import {
  getSalesDailyTotals,
  getSalesDashboardOptions,
  getSalesStoreRows,
  resolveSalesDashboardScope,
} from "$lib/services/sales-dashboard.server";
import {
  buildSalesDashboard,
  buildSalesStoreRows,
  withSingleBrand,
} from "$lib/services/sales-dashboard";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { user } = await requirePermission(event, { sales: ["view"] });
  if (!user) redirect(302, "/login");
  const scope = await resolveSalesDashboardScope(event, user.id);

  if (!scope) {
    return { scope: null };
  }

  const filters = withSingleBrand(scope.filters);
  const [days, stores, options] = await Promise.all([
    getSalesDailyTotals(filters),
    getSalesStoreRows(filters),
    getSalesDashboardOptions(filters),
  ]);

  return {
    scope: { brands: scope.brands, filters },
    dashboard: buildSalesDashboard(days, filters.from, filters.to),
    stores: buildSalesStoreRows(stores),
    ...options,
  };
};
