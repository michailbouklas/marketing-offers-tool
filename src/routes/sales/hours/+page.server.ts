import { redirect } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/auth-guards";
import {
  getSalesDashboardOptions,
  resolveSalesDashboardScope,
} from "$lib/services/sales-dashboard.server";
import { withSingleBrand } from "$lib/services/sales-dashboard";
import {
  buildSalesCalendar,
  buildSalesHoursGrid,
  isDateView,
} from "$lib/services/sales-hours";
import {
  getSalesDayTotals,
  getSalesHourCells,
} from "$lib/services/sales-hours.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { user } = await requirePermission(event, { sales: ["view"] });
  if (!user) redirect(302, "/login");
  const scope = await resolveSalesDashboardScope(event, user.id);

  if (!scope) {
    return { scope: null };
  }

  const filters = withSingleBrand(scope.filters);
  const [cells, options, days] = await Promise.all([
    getSalesHourCells(filters),
    getSalesDashboardOptions(filters),
    isDateView(event.url.searchParams) ? getSalesDayTotals(filters) : null,
  ]);

  return {
    scope: { brands: scope.brands, filters },
    grid: buildSalesHoursGrid(cells, filters.from, filters.to),
    calendar: days && buildSalesCalendar(days, filters.from, filters.to),
    locations: options.locations,
    divisions: options.divisions,
    channels: options.channels,
  };
};
