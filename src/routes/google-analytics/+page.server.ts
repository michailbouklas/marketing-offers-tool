import { redirect } from "@sveltejs/kit";
import { isAdminRole } from "$lib/auth/roles";
import {
  getAuthenticatedUserRole,
  requireAdminUser,
} from "$lib/server/auth-guards";
import { getGoogleAnalyticsCacheTtlMs } from "$lib/server/env";
import { invalidateGoogleAnalyticsCache } from "$lib/server/google-analytics-cache.server";
import { clearGoogleAnalyticsMetadataCache } from "$lib/server/google-analytics-gateway.server";
import { getGoogleAnalyticsDashboardResult } from "$lib/services/google-analytics/dashboard.server";
import { describeGoogleAnalyticsError } from "$lib/services/google-analytics/ga4-client.server";
import {
  buildGoogleAnalyticsHref,
  parseGoogleAnalyticsFilters,
  type GoogleAnalyticsDashboardResult,
  type GoogleAnalyticsFilters,
  type GoogleAnalyticsPropertyRef,
  type GoogleAnalyticsRange,
} from "$lib/services/google-analytics/google-analytics";
import { resolveGoogleAnalyticsScope } from "$lib/services/google-analytics/properties.server";
import { clearGoogleAnalyticsRefreshJobs } from "$lib/services/google-analytics/refresh-queue.server";
import { clearGoogleAnalyticsReportCache } from "$lib/services/google-analytics/report-cache.server";
import type { Actions, PageServerLoad } from "./$types";

/** Streamed to the page: either the dashboard (with per-widget state) or a user-facing error. */
export type GoogleAnalyticsDashboardLoad =
  | { result: GoogleAnalyticsDashboardResult; error: null }
  | { result: null; error: string };

/**
 * Never rejects — a rejected streamed promise would surface as an unhandled
 * error on the client instead of the inline alert. A quota hit is not an
 * error here: the loader serves cached widgets and marks the rest pending.
 */
async function loadDashboard(
  property: GoogleAnalyticsPropertyRef,
  range: GoogleAnalyticsRange,
): Promise<GoogleAnalyticsDashboardLoad> {
  try {
    const result = await getGoogleAnalyticsDashboardResult(property, range);
    return { result, error: null };
  } catch (err) {
    console.error(
      `[google-analytics] dashboard load failed for property row ${property.id}:`,
      err instanceof Error ? err.message : err,
    );
    return { result: null, error: describeGoogleAnalyticsError(err) };
  }
}

/**
 * `/google-analytics`: permission gate and brand/property scope (the user's
 * own assignments only) are awaited so the shell renders immediately; the
 * dashboard itself is streamed under `streamed.dashboard` and the page shows
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
    isAdmin: isAdminRole(await getAuthenticatedUserRole(event)),
    cacheTtlHours:
      Math.round((getGoogleAnalyticsCacheTtlMs() / 3_600_000) * 10) / 10,
    streamed: {
      dashboard: scope.property
        ? loadDashboard(scope.property, scope.range)
        : Promise.resolve<GoogleAnalyticsDashboardLoad | null>(null),
    },
  };
};

export const actions: Actions = {
  /**
   * Admin / superUser only: drop every cached dashboard report, every pending
   * retry job and the in-memory realtime / metadata caches, then return to the
   * same brand / property / range so the dashboard refetches from Google.
   */
  clearCache: async (event) => {
    const { user } = await requireAdminUser(event);
    const form = await event.request.formData();
    const filters = parseGoogleAnalyticsFilters(
      new URLSearchParams({
        brand: String(form.get("brand") ?? ""),
        property: String(form.get("property") ?? ""),
        range: String(form.get("range") ?? ""),
      }),
    );

    const [reports, jobs] = await Promise.all([
      clearGoogleAnalyticsReportCache(),
      clearGoogleAnalyticsRefreshJobs(),
    ]);
    invalidateGoogleAnalyticsCache();
    clearGoogleAnalyticsMetadataCache();

    console.info(
      `[google-analytics] caches cleared by ${user.id}: ${reports} cached report(s), ${jobs} refresh job(s).`,
    );

    redirect(303, buildGoogleAnalyticsHref(event.url.pathname, filters));
  },
};
