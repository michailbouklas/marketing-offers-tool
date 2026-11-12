import { redirect } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/auth-guards";
import { resolveSalesDashboardScope } from "$lib/services/sales-dashboard.server";
import { withSingleBrand } from "$lib/services/sales-dashboard";
import {
  buildOfferCalendar,
  parseOfferDateRange,
  parseOfferLocations,
} from "$lib/services/sales-offers";
import {
  getCachedOfferValues,
  getOfferCalendarRows,
  getOfferFilterOptions,
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
  const { channels, locations: locationOptions } = await getOfferFilterOptions(
    filters,
    range,
  );
  // Only the brand's own stores: another brand's ids (stale URL) are dropped.
  const locations = parseOfferLocations(event.url.searchParams).filter((id) =>
    locationOptions.some((option) => option.id === id),
  );
  const base = {
    scope: { brands: scope.brands, filters },
    range,
    channels,
    locationOptions,
    locations,
  };

  if (event.url.searchParams.get("tab") === "calendar") {
    // A calendar over all time is unreadable, so no range = the scope default (last 30 days).
    const calendarRange = range ?? { from: filters.from, to: filters.to };
    return {
      ...base,
      calendarRange,
      calendar: getOfferCalendarRows(
        brand,
        calendarRange,
        filters.channels,
        locations,
      ).then((rows) =>
        buildOfferCalendar(rows, calendarRange.from, calendarRange.to),
      ),
      offers: null,
    };
  }

  // The cache holds all channels and locations over all time only; anything else is live.
  if (range || filters.channels.length > 0 || locations.length > 0) {
    return {
      ...base,
      offers: getOfferValuesForRange(brand, range, filters.channels, locations),
    };
  }

  const cached = await getCachedOfferValues(brand);

  return {
    ...base,
    // Cache miss (never computed): stream the first build; it takes seconds.
    offers:
      cached ??
      refreshOfferValues(brand).then(() => getCachedOfferValues(brand)),
  };
};
