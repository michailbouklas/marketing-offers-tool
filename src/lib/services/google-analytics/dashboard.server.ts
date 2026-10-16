import { getGoogleAnalyticsCacheTtlMs } from "$lib/server/env";
import {
  buildGoogleAnalyticsCacheKey,
  withGoogleAnalyticsCache,
} from "$lib/server/google-analytics-cache.server";
import {
  buildDashboardBatches,
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
 * Loads the overview dashboard for one GA4 property: eleven reports sent as
 * three parallel `batchRunReports` calls (Google caps a batch at five),
 * flattened back into request order, mapped to the UI model and cached per
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
      const batches = buildDashboardBatches(range);
      const reports = (
        await Promise.all(
          batches.map((requests) =>
            batchRunReports(propertyId, requests, credentials),
          ),
        )
      ).flat();

      return mapDashboardResponse(reports);
    },
  );
}
