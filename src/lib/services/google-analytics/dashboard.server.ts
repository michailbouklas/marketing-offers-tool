import { getGoogleAnalyticsCacheTtlMs } from "$lib/server/env";
import {
  buildGoogleAnalyticsCacheKey,
  withGoogleAnalyticsCache,
} from "$lib/server/google-analytics-cache.server";
import {
  buildDashboardRequests,
  mapDashboardResponse,
} from "./dashboard-reports";
import { batchRunReports } from "./ga4-client.server";
import type {
  GoogleAnalyticsDashboard,
  GoogleAnalyticsPropertyRef,
  GoogleAnalyticsRange,
} from "./google-analytics";
import { getDecryptedCredentials } from "./properties.server";

/**
 * Loads the overview dashboard for one GA4 property: one `batchRunReports`
 * round-trip (five reports), mapped to the UI model and cached per
 * (property row, range) for `GOOGLE_ANALYTICS_CACHE_TTL_MS`.
 *
 * Throws `GoogleAnalyticsApiError` (Google refused / unreachable) or a crypto
 * error (key missing / changed); the page turns both into a message via
 * `describeGoogleAnalyticsError`.
 */
export async function getGoogleAnalyticsDashboard(
  property: Pick<GoogleAnalyticsPropertyRef, "id">,
  range: GoogleAnalyticsRange,
): Promise<GoogleAnalyticsDashboard> {
  const key = buildGoogleAnalyticsCacheKey({
    propertyRowId: property.id,
    range,
  });

  return withGoogleAnalyticsCache(
    key,
    getGoogleAnalyticsCacheTtlMs(),
    async () => {
      const { propertyId, credentials } = await getDecryptedCredentials(
        property.id,
      );
      const reports = await batchRunReports(
        propertyId,
        buildDashboardRequests(range),
        credentials,
      );

      return mapDashboardResponse(reports);
    },
  );
}
