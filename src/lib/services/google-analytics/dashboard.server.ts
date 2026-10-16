import { getGoogleAnalyticsCacheTtlMs } from "$lib/server/env";
import { fetchAndCacheDashboardReports } from "./dashboard-fetch.server";
import {
  DASHBOARD_REPORT_ORDER,
  mapDashboardResponse,
} from "./dashboard-reports";
import {
  describeGoogleAnalyticsError,
  isRetryableGoogleAnalyticsError,
  type Ga4ReportResponse,
} from "./ga4-client.server";
import type {
  GoogleAnalyticsDashboard,
  GoogleAnalyticsDashboardReportKey,
  GoogleAnalyticsDashboardResult,
  GoogleAnalyticsDashboardStatus,
  GoogleAnalyticsPropertyRef,
  GoogleAnalyticsRange,
  GoogleAnalyticsWidgetState,
} from "./google-analytics";
import {
  enqueueGoogleAnalyticsRefresh,
  getGoogleAnalyticsRefreshJob,
} from "./refresh-queue.server";
import { readCachedReports } from "./report-cache.server";

/**
 * Overview dashboard for one GA4 property, assembled widget by widget from the
 * persistent report cache:
 *
 *   1. every report fresher than `GOOGLE_ANALYTICS_CACHE_TTL_MS` is served as is;
 *   2. stale or missing reports are fetched from Google (≤ 5 per batch,
 *      sequentially) unless a retry job for them is already waiting;
 *   3. when Google refuses with a retryable error (429 quota, 5xx) the stale
 *      copies are served anyway, widgets with no copy at all are reported as
 *      `pending`, and a refresh job is queued for the sweep in
 *      `refresh-queue.server.ts`;
 *   4. anything else (bad key, no access, unknown property) is thrown as
 *      before and the page shows one alert.
 *
 * Concurrent loads of the same (property, range) share one in-flight promise
 * so a burst of tabs costs one Google round-trip.
 */

type CachedEntry = { payload: Ga4ReportResponse; fetchedAt: Date };

const globalForDashboard = globalThis as typeof globalThis & {
  googleAnalyticsDashboardInFlight?: Map<
    string,
    Promise<GoogleAnalyticsDashboardResult>
  >;
};

function inFlight(): Map<string, Promise<GoogleAnalyticsDashboardResult>> {
  globalForDashboard.googleAnalyticsDashboardInFlight ??= new Map();
  return globalForDashboard.googleAnalyticsDashboardInFlight;
}

function assemble(
  entries: Map<GoogleAnalyticsDashboardReportKey, CachedEntry>,
  stale: ReadonlySet<GoogleAnalyticsDashboardReportKey>,
  pendingReason: string,
): GoogleAnalyticsDashboardResult {
  const reports = DASHBOARD_REPORT_ORDER.map(
    (key) => entries.get(key)?.payload,
  ) as Ga4ReportResponse[];
  const widgets = {} as Record<
    GoogleAnalyticsDashboardReportKey,
    GoogleAnalyticsWidgetState
  >;
  const pendingKeys: GoogleAnalyticsDashboardReportKey[] = [];

  for (const key of DASHBOARD_REPORT_ORDER) {
    const entry = entries.get(key);

    if (!entry) {
      widgets[key] = { status: "pending", reason: pendingReason };
      pendingKeys.push(key);
    } else {
      widgets[key] = {
        status: stale.has(key) ? "stale" : "fresh",
        fetchedAt: entry.fetchedAt.toISOString(),
      };
    }
  }

  return { dashboard: mapDashboardResponse(reports), widgets, pendingKeys };
}

async function loadDashboardResult(
  propertyRowId: string,
  range: GoogleAnalyticsRange,
): Promise<GoogleAnalyticsDashboardResult> {
  const ttlMs = getGoogleAnalyticsCacheTtlMs();
  const now = Date.now();
  const entries = new Map<GoogleAnalyticsDashboardReportKey, CachedEntry>();

  for (const report of await readCachedReports(propertyRowId, range)) {
    entries.set(report.key, {
      payload: report.payload,
      fetchedAt: report.fetchedAt,
    });
  }

  const toFetch = DASHBOARD_REPORT_ORDER.filter((key) => {
    const entry = entries.get(key);
    return !entry || now - entry.fetchedAt.getTime() >= ttlMs;
  });

  if (toFetch.length === 0) {
    return assemble(entries, new Set(), "");
  }

  // A retry already scheduled for later means Google refused very recently;
  // asking again now would only add another 429 to the log.
  const job = await getGoogleAnalyticsRefreshJob(propertyRowId, range);
  const waiting =
    job &&
    (job.status === "pending" || job.status === "running") &&
    job.nextRunAt.getTime() > now
      ? new Set(job.reportKeys)
      : new Set<GoogleAnalyticsDashboardReportKey>();
  const askNow = toFetch.filter((key) => !waiting.has(key));
  const outcome = await fetchAndCacheDashboardReports(
    propertyRowId,
    range,
    askNow,
  );

  for (const [key, payload] of outcome.fetched) {
    entries.set(key, { payload, fetchedAt: outcome.fetchedAt });
  }

  const unresolved = new Set(
    toFetch.filter((key) => !outcome.fetched.has(key)),
  );

  if (outcome.error) {
    if (!isRetryableGoogleAnalyticsError(outcome.error)) {
      throw outcome.error;
    }

    console.warn(
      `[google-analytics] property row ${propertyRowId} (${range}): Google refused ${outcome.failedKeys.join(", ")} — queued for retry. ${
        outcome.error instanceof Error ? outcome.error.message : outcome.error
      }`,
    );
    await enqueueGoogleAnalyticsRefresh({
      propertyRowId,
      range,
      keys: outcome.failedKeys,
      error: outcome.error,
    });
  }

  const reason = outcome.error
    ? describeGoogleAnalyticsError(outcome.error)
    : (job?.lastError ?? "Google Analytics refresh is queued.");

  return assemble(entries, unresolved, reason);
}

/** The page's view: dashboard plus per-widget freshness. Never caches rejections. */
export function getGoogleAnalyticsDashboardResult(
  property: Pick<GoogleAnalyticsPropertyRef, "id">,
  range: GoogleAnalyticsRange,
): Promise<GoogleAnalyticsDashboardResult> {
  const key = `${property.id}:${range}`;
  const running = inFlight().get(key);

  if (running) {
    return running;
  }

  const run = loadDashboardResult(property.id, range).finally(() => {
    inFlight().delete(key);
  });

  inFlight().set(key, run);
  return run;
}

/**
 * Dashboard only — what the assistant's `getDashboard` tool needs. Throws
 * `GoogleAnalyticsApiError` for non-retryable failures; a quota hit yields the
 * cached/partial dashboard instead of an error.
 */
export async function getGoogleAnalyticsDashboard(
  property: Pick<GoogleAnalyticsPropertyRef, "id">,
  range: GoogleAnalyticsRange,
): Promise<GoogleAnalyticsDashboard> {
  return (await getGoogleAnalyticsDashboardResult(property, range)).dashboard;
}

/** Cheap status for the page's poll: which widgets still have no data. */
export async function getGoogleAnalyticsDashboardStatus(
  propertyRowId: string,
  range: GoogleAnalyticsRange,
): Promise<GoogleAnalyticsDashboardStatus> {
  const [cached, job] = await Promise.all([
    readCachedReports(propertyRowId, range),
    getGoogleAnalyticsRefreshJob(propertyRowId, range),
  ]);
  const cachedKeys = new Set(cached.map((report) => report.key));

  return {
    pendingKeys: DASHBOARD_REPORT_ORDER.filter((key) => !cachedKeys.has(key)),
    job: job
      ? {
          status: job.status,
          attempts: job.attempts,
          nextRunAt: job.nextRunAt.toISOString(),
          lastError: job.lastError,
        }
      : null,
  };
}

/** Test hook. */
export function clearGoogleAnalyticsDashboardInFlight(): void {
  inFlight().clear();
}
