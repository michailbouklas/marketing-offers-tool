import {
  buildDashboardRequests,
  DASHBOARD_REPORT_ORDER,
  REPORTS_PER_BATCH,
} from "./dashboard-reports";
import {
  batchRunReports,
  type Ga4PropertyQuota,
  type Ga4ReportRequest,
  type Ga4ReportResponse,
} from "./ga4-client.server";
import type {
  GoogleAnalyticsDashboardReportKey,
  GoogleAnalyticsRange,
} from "./google-analytics";
import { getDecryptedCredentials } from "./properties.server";
import { writeCachedReports } from "./report-cache.server";

/**
 * The one place dashboard reports are fetched from Google. Shared by the page
 * loader (cache miss) and the refresh worker (retry) so both persist results
 * the same way. Kept apart from `dashboard.server.ts` and
 * `refresh-queue.server.ts` so neither has to import the other.
 */

export type DashboardFetchOutcome = {
  /** Reports Google returned, already written to the cache. */
  fetched: Map<GoogleAnalyticsDashboardReportKey, Ga4ReportResponse>;
  /** Keys still missing when `error` is set (never non-empty otherwise). */
  failedKeys: GoogleAnalyticsDashboardReportKey[];
  /** The first failure (`GoogleAnalyticsApiError`, crypto error, …) or null. */
  error: unknown;
  fetchedAt: Date;
};

function describeQuota(quota: Ga4PropertyQuota | undefined): string | null {
  if (!quota) return null;

  const part = (label: string, status: { remaining?: number } | undefined) =>
    status?.remaining === undefined ? null : `${label} ${status.remaining}`;

  const parts = [
    part("project/hour", quota.tokensPerProjectPerHour),
    part("property/hour", quota.tokensPerHour),
    part("property/day", quota.tokensPerDay),
    part("server-errors/hour", quota.serverErrorsPerProjectPerHour),
  ].filter((value): value is string => value !== null);

  return parts.length > 0 ? `tokens remaining: ${parts.join(", ")}` : null;
}

/**
 * Fetches `keys` from Google in request order, at most `REPORTS_PER_BATCH` per
 * `batchRunReports` call and one batch at a time (the property allows ten
 * concurrent requests in total and the live card and assistant share them).
 * Every successful batch is persisted before the next starts, so a 429 on
 * batch two still leaves batch one cached. Never throws: the outcome carries
 * the error and the keys it left behind.
 */
export async function fetchAndCacheDashboardReports(
  propertyRowId: string,
  range: GoogleAnalyticsRange,
  keys: readonly GoogleAnalyticsDashboardReportKey[],
): Promise<DashboardFetchOutcome> {
  const fetchedAt = new Date();
  const fetched = new Map<
    GoogleAnalyticsDashboardReportKey,
    Ga4ReportResponse
  >();
  const wanted = new Set(keys);
  const ordered = DASHBOARD_REPORT_ORDER.filter((key) => wanted.has(key));

  if (ordered.length === 0) {
    return { fetched, failedKeys: [], error: null, fetchedAt };
  }

  const remaining = () => ordered.filter((key) => !fetched.has(key));

  try {
    const { propertyId, credentials } =
      await getDecryptedCredentials(propertyRowId);
    const allRequests = buildDashboardRequests(range);
    const requestByKey = new Map<
      GoogleAnalyticsDashboardReportKey,
      Ga4ReportRequest
    >(
      DASHBOARD_REPORT_ORDER.map((key, position) => [
        key,
        allRequests[position]!,
      ]),
    );

    for (let start = 0; start < ordered.length; start += REPORTS_PER_BATCH) {
      const chunk = ordered.slice(start, start + REPORTS_PER_BATCH);
      const requests = chunk.map((key, position) => {
        const request = requestByKey.get(key)!;
        // One quota readout per batch is enough to see who is draining tokens.
        return position === 0
          ? { ...request, returnPropertyQuota: true }
          : request;
      });

      const reports = await batchRunReports(propertyId, requests, credentials);
      const quota = describeQuota(reports[0]?.propertyQuota);

      if (quota) {
        console.info(
          `[google-analytics] property row ${propertyRowId} (${range}, ${chunk.join("+")}): ${quota}`,
        );
      }

      const batch = chunk.flatMap((key, position) => {
        const report = reports[position];
        return report ? [{ key, payload: report }] : [];
      });

      await writeCachedReports(propertyRowId, range, batch, fetchedAt);

      for (const entry of batch) {
        fetched.set(entry.key, entry.payload);
      }
    }

    return { fetched, failedKeys: remaining(), error: null, fetchedAt };
  } catch (error) {
    return { fetched, failedKeys: remaining(), error, fetchedAt };
  }
}
