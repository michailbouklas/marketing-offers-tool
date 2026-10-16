import { getGoogleAnalyticsCacheTtlMs } from "$lib/server/env";
import { getGoogleAnalyticsDashboard } from "$lib/services/google-analytics/dashboard.server";
import { describeGoogleAnalyticsError } from "$lib/services/google-analytics/ga4-client.server";
import {
  parseGoogleAnalyticsFilters,
  type GoogleAnalyticsDashboard,
  type GoogleAnalyticsFilters,
  type GoogleAnalyticsPropertyRef,
  type GoogleAnalyticsRange,
} from "$lib/services/google-analytics/google-analytics";
import { resolveGoogleAnalyticsScope } from "$lib/services/google-analytics/properties.server";
import type { PageServerLoad } from "./$types";

/** Streamed to the page: either the dashboard or a user-facing error. */
export type GoogleAnalyticsDashboardResult =
  | { dashboard: GoogleAnalyticsDashboard; error: null }
  | { dashboard: null; error: string };

/**
 * Never rejects — a rejected streamed promise would surface as an unhandled
 * error on the client instead of the inline alert.
 */
async function loadDashboardResult(
  property: GoogleAnalyticsPropertyRef,
  range: GoogleAnalyticsRange,
): Promise<GoogleAnalyticsDashboardResult> {
  try {
    const dashboard = await getGoogleAnalyticsDashboard(property, range);
    return { dashboard, error: null };
  } catch (err) {
    console.error(
      `[google-analytics] dashboard load failed for property row ${property.id}:`,
      err instanceof Error ? err.message : err,
    );
    return { dashboard: null, error: describeGoogleAnalyticsError(err) };
  }
}

/**
 * `/google-analytics`: permission gate and brand/property scope (the user's
 * own assignments only) are awaited so the shell renders immediately; the
 * Google call itself is streamed under `streamed.dashboard` and the page shows
 * skeletons until it settles. A Google failure is reported inline so the user
 * can still switch brand / property / range.
 */
export const load: PageServerLoad = async (event) => {
  const requested = parseGoogleAnalyticsFilters(event.url.searchParams);
  const scope = await resolveGoogleAnalyticsScope(event, requested);

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
    cacheTtlMinutes: Math.round(getGoogleAnalyticsCacheTtlMs() / 60_000),
    streamed: {
      dashboard: scope.property
        ? loadDashboardResult(scope.property, scope.range)
        : Promise.resolve<GoogleAnalyticsDashboardResult | null>(null),
    },
  };
};
