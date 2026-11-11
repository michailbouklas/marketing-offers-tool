import { redirect } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/auth-guards";
import {
  getSalesDashboardOptions,
  resolveSalesDashboardScope,
} from "$lib/services/sales-dashboard.server";
import { withSingleBrand } from "$lib/services/sales-dashboard";
import {
  buildChannelBreakdown,
  buildSalesCalendar,
  buildSalesHoursGrid,
  isChannelVs,
  isDateView,
  isGroupedByDay,
} from "$lib/services/sales-hours";
import {
  getSalesChannelRows,
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
  const params = event.url.searchParams;
  // VS only makes sense across channels, so a channel filter switches it off.
  const vs = isChannelVs(params) && filters.channels.length === 0;
  const [cells, options, days, channelRows] = await Promise.all([
    getSalesHourCells(filters),
    getSalesDashboardOptions(filters),
    isDateView(params) ? getSalesDayTotals(filters) : null,
    vs ? getSalesChannelRows(filters) : null,
  ]);

  return {
    scope: { brands: scope.brands, filters },
    grid: buildSalesHoursGrid(cells, filters.from, filters.to),
    calendar: days && buildSalesCalendar(days, filters.from, filters.to),
    breakdown:
      channelRows &&
      buildChannelBreakdown(
        channelRows,
        filters.from,
        filters.to,
        isDateView(params)
          ? "date"
          : isGroupedByDay(params)
            ? "weekday"
            : "hour",
      ),
    locations: options.locations,
    divisions: options.divisions,
    channels: options.channels,
  };
};
