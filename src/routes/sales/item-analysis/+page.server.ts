import { redirect } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/auth-guards";
import { resolveSalesDashboardScope } from "$lib/services/sales-dashboard.server";
import { withSingleBrand } from "$lib/services/sales-dashboard";
import {
  parseOfferDateRange,
  parseOfferLocations,
  scopeOfferLocations,
} from "$lib/services/sales-offers";
import { getOfferFilterOptions } from "$lib/services/sales-offers.server";
import { buildItemAnalysis } from "$lib/services/sales-item-analysis";
import { getItemAnalysisRows } from "$lib/services/sales-item-analysis.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { user } = await requirePermission(event, { sales: ["view"] });
  if (!user) redirect(302, "/login");
  const scope = await resolveSalesDashboardScope(event, user.id);

  if (!scope) {
    return { scope: null };
  }

  const filters = withSingleBrand(scope.filters);
  // Line-level data over all time is too heavy: no range = the scope default (last 30 days).
  const range = parseOfferDateRange(event.url.searchParams) ?? {
    from: filters.from,
    to: filters.to,
  };
  const { channels, locations: locationOptions } = await getOfferFilterOptions(
    filters,
    range,
  );
  const {
    cities,
    locations,
    scoped: scopedLocations,
  } = scopeOfferLocations(
    locationOptions,
    parseOfferLocations(event.url.searchParams),
    filters.cities ?? [],
  );

  return {
    scope: { brands: scope.brands, filters },
    range,
    channels,
    locationOptions,
    locations,
    cities,
    report: getItemAnalysisRows(
      filters.brands[0],
      range,
      filters.channels,
      scopedLocations,
    ).then(buildItemAnalysis),
  };
};
