import { withGoogleAnalyticsRealtimeCache } from "$lib/server/google-analytics-cache.server";
import {
  buildRealtimeRequests,
  mapRealtimeResponse,
} from "./dashboard-reports";
import { runRealtimeReport } from "./ga4-client.server";
import type {
  GoogleAnalyticsPropertyRef,
  GoogleAnalyticsRealtime,
} from "./google-analytics";
import { getDecryptedCredentials } from "./properties.server";

/** Browsers poll every 60 s; the shared snapshot is at most this old. */
export const REALTIME_CACHE_TTL_MS = 30_000;

/**
 * "Live now" snapshot for one property: three `runRealtimeReport` calls in
 * parallel (there is no realtime batch endpoint), cached for 30 s per property
 * so concurrent viewers share one Google round-trip.
 */
export async function getGoogleAnalyticsRealtime(
  property: Pick<GoogleAnalyticsPropertyRef, "id">,
): Promise<GoogleAnalyticsRealtime> {
  return withGoogleAnalyticsRealtimeCache(
    property.id,
    REALTIME_CACHE_TTL_MS,
    async () => {
      const { propertyId, credentials } = await getDecryptedCredentials(
        property.id,
      );
      const reports = await Promise.all(
        buildRealtimeRequests().map((request) =>
          runRealtimeReport(propertyId, request, credentials),
        ),
      );

      return mapRealtimeResponse(reports);
    },
  );
}
