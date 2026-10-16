import type {
  Ga4ReportRequest,
  Ga4ReportResponse,
  Ga4Row,
} from "./ga4-client.server";
import {
  googleAnalyticsRangeDays,
  type GoogleAnalyticsBreakdownRow,
  type GoogleAnalyticsDailyPoint,
  type GoogleAnalyticsDashboard,
  type GoogleAnalyticsRange,
  type GoogleAnalyticsTotals,
} from "./google-analytics";

/**
 * Pure request builders + response mapper for the overview dashboard. Kept
 * free of Prisma/env imports so the mapping is unit-testable with fixtures.
 *
 * GA4 metric/dimension API names (Data API v1beta):
 *   metrics    activeUsers, newUsers, sessions, engagementRate,
 *              averageSessionDuration, keyEvents, screenPageViews
 *   dimensions date, sessionDefaultChannelGroup, pagePath, deviceCategory,
 *              country
 */

export const TOTALS_METRICS = [
  "activeUsers",
  "newUsers",
  "sessions",
  "engagementRate",
  "averageSessionDuration",
  "keyEvents",
  "screenPageViews",
] as const;

const BREAKDOWN_METRICS = ["sessions", "activeUsers"] as const;
const BREAKDOWN_LIMIT = 10;

/** Request order inside the batch; the mapper relies on it. */
export const DASHBOARD_REPORT_ORDER = [
  "daily",
  "channels",
  "pages",
  "devices",
  "countries",
] as const;

export type DashboardReportKey = (typeof DASHBOARD_REPORT_ORDER)[number];

const BREAKDOWN_DIMENSIONS: Record<
  Exclude<DashboardReportKey, "daily">,
  string
> = {
  channels: "sessionDefaultChannelGroup",
  pages: "pagePath",
  devices: "deviceCategory",
  countries: "country",
};

/**
 * Today is always partial in GA4 (and often delayed by hours), so every range
 * ends yesterday: "last 7 days" = the 7 complete days before today.
 */
export function dateRangeFor(range: GoogleAnalyticsRange): {
  startDate: string;
  endDate: string;
} {
  return {
    startDate: `${googleAnalyticsRangeDays[range]}daysAgo`,
    endDate: "yesterday",
  };
}

export function buildDashboardRequests(
  range: GoogleAnalyticsRange,
): Ga4ReportRequest[] {
  const dateRanges = [dateRangeFor(range)];

  const daily: Ga4ReportRequest = {
    dimensions: [{ name: "date" }],
    metrics: TOTALS_METRICS.map((name) => ({ name })),
    dateRanges,
    orderBys: [{ dimension: { dimensionName: "date" } }],
    // TOTAL gives the aggregate over the whole range in one request, so the
    // tiles and the trend share a report.
    metricAggregations: ["TOTAL"],
    keepEmptyRows: true,
    limit: 400,
  };

  const breakdown = (dimension: string): Ga4ReportRequest => ({
    dimensions: [{ name: dimension }],
    metrics: BREAKDOWN_METRICS.map((name) => ({ name })),
    dateRanges,
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: BREAKDOWN_LIMIT,
  });

  return [
    daily,
    breakdown(BREAKDOWN_DIMENSIONS.channels),
    breakdown(BREAKDOWN_DIMENSIONS.pages),
    breakdown(BREAKDOWN_DIMENSIONS.devices),
    breakdown(BREAKDOWN_DIMENSIONS.countries),
  ];
}

// --- Response mapping ---------------------------------------------------------------------

function metricIndex(report: Ga4ReportResponse): Map<string, number> {
  const index = new Map<string, number>();
  (report.metricHeaders ?? []).forEach((header, position) => {
    index.set(header.name, position);
  });
  return index;
}

function metricValue(
  row: Ga4Row | undefined,
  index: Map<string, number>,
  name: string,
): number {
  const position = index.get(name);
  if (row === undefined || position === undefined) {
    return 0;
  }
  const raw = row.metricValues?.[position]?.value;
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dimensionValue(row: Ga4Row, position = 0): string {
  return row.dimensionValues?.[position]?.value ?? "";
}

/** GA4 `date` dimension is `YYYYMMDD`. */
export function formatGa4Date(value: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : value;
}

function mapDaily(report: Ga4ReportResponse): GoogleAnalyticsDailyPoint[] {
  const index = metricIndex(report);

  return (report.rows ?? [])
    .map((row) => ({
      day: formatGa4Date(dimensionValue(row)),
      activeUsers: metricValue(row, index, "activeUsers"),
      sessions: metricValue(row, index, "sessions"),
    }))
    .sort((left, right) => left.day.localeCompare(right.day));
}

/**
 * Totals come from the TOTAL aggregation row when present; otherwise they are
 * recomputed from the daily rows (sums for additive metrics, session-weighted
 * means for the rate/average ones). `activeUsers` summed across days
 * overcounts returning users, which is why the aggregation row is preferred.
 */
function mapTotals(report: Ga4ReportResponse): GoogleAnalyticsTotals {
  const index = metricIndex(report);
  const totalRow = report.totals?.[0];

  if (totalRow) {
    return {
      activeUsers: metricValue(totalRow, index, "activeUsers"),
      newUsers: metricValue(totalRow, index, "newUsers"),
      sessions: metricValue(totalRow, index, "sessions"),
      engagementRate: metricValue(totalRow, index, "engagementRate"),
      averageSessionDurationSeconds: metricValue(
        totalRow,
        index,
        "averageSessionDuration",
      ),
      keyEvents: metricValue(totalRow, index, "keyEvents"),
      screenPageViews: metricValue(totalRow, index, "screenPageViews"),
    };
  }

  const rows = report.rows ?? [];
  const sum = (name: string) =>
    rows.reduce((acc, row) => acc + metricValue(row, index, name), 0);
  const sessions = sum("sessions");
  const weighted = (name: string) =>
    sessions > 0
      ? rows.reduce(
          (acc, row) =>
            acc +
            metricValue(row, index, name) * metricValue(row, index, "sessions"),
          0,
        ) / sessions
      : 0;

  return {
    activeUsers: sum("activeUsers"),
    newUsers: sum("newUsers"),
    sessions,
    engagementRate: weighted("engagementRate"),
    averageSessionDurationSeconds: weighted("averageSessionDuration"),
    keyEvents: sum("keyEvents"),
    screenPageViews: sum("screenPageViews"),
  };
}

function mapBreakdown(
  report: Ga4ReportResponse | undefined,
): GoogleAnalyticsBreakdownRow[] {
  if (!report) {
    return [];
  }

  const index = metricIndex(report);

  return (report.rows ?? []).map((row) => ({
    label: dimensionValue(row) || "(not set)",
    sessions: metricValue(row, index, "sessions"),
    activeUsers: metricValue(row, index, "activeUsers"),
  }));
}

export function mapDashboardResponse(
  reports: Ga4ReportResponse[],
): GoogleAnalyticsDashboard {
  const [daily, channels, pages, devices, countries] = reports;
  const dailyReport = daily ?? {};

  return {
    totals: mapTotals(dailyReport),
    daily: mapDaily(dailyReport),
    channels: mapBreakdown(channels),
    pages: mapBreakdown(pages),
    devices: mapBreakdown(devices),
    countries: mapBreakdown(countries),
  };
}
