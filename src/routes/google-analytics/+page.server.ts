import { getGoogleAnalyticsCacheTtlMs } from "$lib/server/env";
import { getGoogleAnalyticsDashboard } from "$lib/services/google-analytics/dashboard.server";
import { describeGoogleAnalyticsError } from "$lib/services/google-analytics/ga4-client.server";
import {
  parseGoogleAnalyticsFilters,
  type GoogleAnalyticsDashboard,
  type GoogleAnalyticsFilters,
} from "$lib/services/google-analytics/google-analytics";
import { resolveGoogleAnalyticsScope } from "$lib/services/google-analytics/properties.server";
import type { PageServerLoad } from "./$types";

/**
 * `/google-analytics`: permission gate, brand/property scope (the user's own
 * assignments only) and the overview dashboard for the selected property.
 * A Google failure is reported inline instead of failing the page, so the
 * user can still switch brand / property / range.
 */
export const load: PageServerLoad = async (event) => {
  const requested = parseGoogleAnalyticsFilters(event.url.searchParams);
  const scope = await resolveGoogleAnalyticsScope(event, requested);

  let dashboard: GoogleAnalyticsDashboard | null = null;
  let loadError: string | null = null;

  if (scope.property) {
    try {
      dashboard = await getGoogleAnalyticsDashboard(
        scope.property,
        scope.range,
      );
    } catch (err) {
      console.error(
        `[google-analytics] dashboard load failed for property row ${scope.property.id}:`,
        err instanceof Error ? err.message : err,
      );
      loadError = describeGoogleAnalyticsError(err);
    }
  }

  const filters: GoogleAnalyticsFilters = {
    brandId: scope.brand?.id ?? null,
    propertyId: scope.property?.id ?? null,
    range: scope.range,
  };

  return {
    brands: scope.brands,
    brand: scope.brand,
    property: scope.property,
    filters,
    dashboard,
    loadError,
    cacheTtlMinutes: Math.round(getGoogleAnalyticsCacheTtlMs() / 60_000),
  };
};
