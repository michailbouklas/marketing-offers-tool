import { error, json } from "@sveltejs/kit";
import { getGoogleAnalyticsDashboardStatus } from "$lib/services/google-analytics/dashboard.server";
import { parseGoogleAnalyticsFilters } from "$lib/services/google-analytics/google-analytics";
import { resolveGoogleAnalyticsScope } from "$lib/services/google-analytics/properties.server";
import type { RequestHandler } from "./$types";

const NO_STORE = { "cache-control": "no-store" };

/**
 * `GET /api/google-analytics/dashboard-status?brand=<id>&property=<rowId>&range=<range>`
 * — which dashboard widgets still have no cached data and what the retry job
 * is doing. Polled by the page while widgets are pending; never calls Google.
 * Scope is resolved exactly like the page (user's own assignments only).
 */
export const GET: RequestHandler = async (event) => {
  const filters = parseGoogleAnalyticsFilters(event.url.searchParams);
  const scope = await resolveGoogleAnalyticsScope(event, filters, {
    guard: "api",
  });

  if (!scope.property) {
    error(404, "No Google Analytics property in scope");
  }

  const status = await getGoogleAnalyticsDashboardStatus(
    scope.property.id,
    scope.range,
  );

  return json(status, { headers: NO_STORE });
};
