import { prisma } from "$lib/server/prisma";
import type { Prisma } from "../../../generated/prisma/client";
import type { Ga4ReportResponse } from "./ga4-client.server";
import {
  isGoogleAnalyticsDashboardReportKey,
  type GoogleAnalyticsDashboardReportKey,
  type GoogleAnalyticsRange,
} from "./google-analytics";

/**
 * Persistent cache of raw GA4 dashboard reports: one row per (property row,
 * range, report key) in `google_analytics_report_cache`. Unlike the old
 * per-process map this survives restarts and deploys, is shared by every
 * instance, and lets the page serve ten cached widgets when Google refuses the
 * eleventh. Freshness (`GOOGLE_ANALYTICS_CACHE_TTL_MS`) is decided by the
 * reader; rows are only ever replaced or deleted, never expired here.
 */

export type CachedReport = {
  key: GoogleAnalyticsDashboardReportKey;
  payload: Ga4ReportResponse;
  fetchedAt: Date;
};

export type ReportToCache = {
  key: GoogleAnalyticsDashboardReportKey;
  payload: Ga4ReportResponse;
};

/** `propertyQuota` describes the call, not the data — never persist it. */
function stripCallMetadata(report: Ga4ReportResponse): Ga4ReportResponse {
  const { propertyQuota: _quota, ...rest } = report;
  return rest;
}

export async function readCachedReports(
  propertyRowId: string,
  range: GoogleAnalyticsRange,
): Promise<CachedReport[]> {
  const rows = await prisma.google_analytics_report_cache.findMany({
    where: { propertyRowId, range },
    select: { reportKey: true, payload: true, fetchedAt: true },
  });

  const reports: CachedReport[] = [];

  for (const row of rows) {
    // A key dropped from the dashboard leaves orphan rows; ignore them.
    if (!isGoogleAnalyticsDashboardReportKey(row.reportKey)) continue;

    reports.push({
      key: row.reportKey,
      payload: row.payload as unknown as Ga4ReportResponse,
      fetchedAt: row.fetchedAt,
    });
  }

  return reports;
}

/** Upserts every entry with the same `fetchedAt`, atomically. */
export async function writeCachedReports(
  propertyRowId: string,
  range: GoogleAnalyticsRange,
  entries: ReportToCache[],
  fetchedAt: Date = new Date(),
): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  await prisma.$transaction(
    entries.map((entry) => {
      const payload = stripCallMetadata(
        entry.payload,
      ) as unknown as Prisma.InputJsonValue;

      return prisma.google_analytics_report_cache.upsert({
        where: {
          propertyRowId_range_reportKey: {
            propertyRowId,
            range,
            reportKey: entry.key,
          },
        },
        create: {
          propertyRowId,
          range,
          reportKey: entry.key,
          payload,
          fetchedAt,
        },
        update: { payload, fetchedAt },
      });
    }),
  );
}

/**
 * Drops cached reports — for one property (after its key changed) or for
 * every property (admin "Clear GA caches"). Returns the number of rows removed.
 */
export async function clearGoogleAnalyticsReportCache(
  propertyRowId?: string,
): Promise<number> {
  const result = await prisma.google_analytics_report_cache.deleteMany({
    where: propertyRowId ? { propertyRowId } : {},
  });

  return result.count;
}
