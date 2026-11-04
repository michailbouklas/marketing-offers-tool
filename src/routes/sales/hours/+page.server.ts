import { redirect } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/auth-guards";
import {
  getSalesDashboardOptions,
  resolveSalesDashboardScope,
} from "$lib/services/sales-dashboard.server";
import { withSingleBrand } from "$lib/services/sales-dashboard";
import { buildSalesHoursGrid } from "$lib/services/sales-hours";
import { getSalesHourCells } from "$lib/services/sales-hours.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { user } = await requirePermission(event, { sales: ["view"] });
  if (!user) redirect(302, "/login");
  const scope = await resolveSalesDashboardScope(event, user.id);

  if (!scope) {
    return { scope: null };
  }

  const filters = withSingleBrand(scope.filters);
  const [cells, options] = await Promise.all([
    getSalesHourCells(filters),
    getSalesDashboardOptions(filters),
  ]);

  return {
    scope: { brands: scope.brands, filters },
    grid: buildSalesHoursGrid(cells, filters.from, filters.to),
    locations: options.locations,
    divisions: options.divisions,
  };
};
