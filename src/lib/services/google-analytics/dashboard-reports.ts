import type {
  Ga4RealtimeRequest,
  Ga4ReportRequest,
  Ga4ReportResponse,
  Ga4Row,
} from "./ga4-client.server";
import {
  googleAnalyticsDashboardReportKeys,
  googleAnalyticsRangeDays,
  type GoogleAnalyticsAudienceSegment,
  type GoogleAnalyticsBreakdownRow,
  type GoogleAnalyticsCampaignRow,
  type GoogleAnalyticsDailyPoint,
  type GoogleAnalyticsDashboard,
  type GoogleAnalyticsDashboardReportKey,
  type GoogleAnalyticsHeatmapCell,
  type GoogleAnalyticsKeyEventRow,
  type GoogleAnalyticsLandingPageRow,
  type GoogleAnalyticsRange,
  type GoogleAnalyticsRealtime,
  type GoogleAnalyticsTotals,
} from "./google-analytics";

/**
 * Pure request builders + response mappers for the overview dashboard and
 * the realtime card. Kept free of Prisma/env imports so the mapping is
 * unit-testable with fixtures.
 *
 * GA4 API names used (Data API v1beta):
 *   metrics    activeUsers, newUsers, sessions, engagementRate,
 *              averageSessionDuration, keyEvents, screenPageViews,
 *              userEngagementDuration
 *   dimensions date, sessionDefaultChannelGroup, pagePath, deviceCategory,
 *              country, city, sessionSourceMedium, sessionCampaignName,
 *              landingPage, dayOfWeek, hour, newVsReturning, eventName
 *   realtime   minutesAgo, unifiedScreenName
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

/** batchRunReports accepts at most this many requests. */
export const REPORTS_PER_BATCH = 5;

/** Request order (flattened across batches); the mapper relies on it. */
export const DASHBOARD_REPORT_ORDER = googleAnalyticsDashboardReportKeys;

export type DashboardReportKey = GoogleAnalyticsDashboardReportKey;

/** Value GA4 puts in the auto-added `dateRange` dimension per range index. */
const DATE_RANGE_CURRENT = "date_range_0";
const DATE_RANGE_PREVIOUS = "date_range_1";

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

/** The period of equal length immediately before `dateRangeFor(range)`. */
export function previousDateRangeFor(range: GoogleAnalyticsRange): {
  startDate: string;
  endDate: string;
} {
  const days = googleAnalyticsRangeDays[range];

  return {
    startDate: `${days * 2}daysAgo`,
    endDate: `${days + 1}daysAgo`,
  };
}

export function buildDashboardRequests(
  range: GoogleAnalyticsRange,
): Ga4ReportRequest[] {
  const dateRanges = [dateRangeFor(range)];
  const sessionsDesc = [{ metric: { metricName: "sessions" }, desc: true }];

  const daily: Ga4ReportRequest = {
    dimensions: [{ name: "date" }],
    metrics: TOTALS_METRICS.map((name) => ({ name })),
    // Two ranges: GA4 appends a `dateRange` dimension to every row and
    // returns one TOTAL row per range, which feeds the period deltas.
    dateRanges: [dateRangeFor(range), previousDateRangeFor(range)],
    orderBys: [{ dimension: { dimensionName: "date" } }],
    metricAggregations: ["TOTAL"],
    keepEmptyRows: true,
    limit: 400,
  };

  const breakdown = (dimension: string): Ga4ReportRequest => ({
    dimensions: [{ name: dimension }],
    metrics: BREAKDOWN_METRICS.map((name) => ({ name })),
    dateRanges,
    orderBys: sessionsDesc,
    limit: BREAKDOWN_LIMIT,
  });

  const campaigns: Ga4ReportRequest = {
    dimensions: [
      { name: "sessionSourceMedium" },
      { name: "sessionCampaignName" },
    ],
    metrics: [
      { name: "sessions" },
      { name: "engagementRate" },
      { name: "keyEvents" },
    ],
    dateRanges,
    orderBys: sessionsDesc,
    limit: 15,
  };

  const landingPages: Ga4ReportRequest = {
    dimensions: [{ name: "landingPage" }],
    metrics: [
      { name: "sessions" },
      { name: "newUsers" },
      { name: "userEngagementDuration" },
      { name: "keyEvents" },
    ],
    dateRanges,
    orderBys: sessionsDesc,
    limit: BREAKDOWN_LIMIT,
  };

  const heatmap: Ga4ReportRequest = {
    dimensions: [{ name: "dayOfWeek" }, { name: "hour" }],
    metrics: [{ name: "sessions" }],
    dateRanges,
    keepEmptyRows: true,
    limit: 7 * 24,
  };

  const newVsReturning: Ga4ReportRequest = {
    dimensions: [{ name: "newVsReturning" }],
    metrics: [
      { name: "activeUsers" },
      { name: "sessions" },
      { name: "engagementRate" },
    ],
    dateRanges,
  };

  const keyEventsByName: Ga4ReportRequest = {
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "keyEvents" }],
    dateRanges,
    metricFilter: {
      filter: {
        fieldName: "keyEvents",
        numericFilter: {
          operation: "GREATER_THAN",
          value: { int64Value: "0" },
        },
      },
    },
    orderBys: [{ metric: { metricName: "keyEvents" }, desc: true }],
    limit: BREAKDOWN_LIMIT,
  };

  const byKey: Record<DashboardReportKey, Ga4ReportRequest> = {
    daily,
    channels: breakdown("sessionDefaultChannelGroup"),
    // Page title (web) or screen name (app): the same property can carry both
    // streams, and app-only properties leave pagePath "(not set)".
    pages: breakdown("unifiedScreenName"),
    devices: breakdown("deviceCategory"),
    countries: breakdown("country"),
    campaigns,
    landingPages,
    heatmap,
    newVsReturning,
    keyEventsByName,
    cities: breakdown("city"),
  };

  return DASHBOARD_REPORT_ORDER.map((key) => byKey[key]);
}

/** Splits the ordered request list into batchRunReports-sized groups. */
export function buildDashboardBatches(
  range: GoogleAnalyticsRange,
): Ga4ReportRequest[][] {
  const requests = buildDashboardRequests(range);
  const batches: Ga4ReportRequest[][] = [];

  for (let start = 0; start < requests.length; start += REPORTS_PER_BATCH) {
    batches.push(requests.slice(start, start + REPORTS_PER_BATCH));
  }

  return batches;
}

// --- Response helpers --------------------------------------------------------------------

function metricIndex(report: Ga4ReportResponse): Map<string, number> {
  const index = new Map<string, number>();
  (report.metricHeaders ?? []).forEach((header, position) => {
    index.set(header.name, position);
  });
  return index;
}

function dimensionIndex(report: Ga4ReportResponse): Map<string, number> {
  const index = new Map<string, number>();
  (report.dimensionHeaders ?? []).forEach((header, position) => {
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

/** Dimension by name; falls back to the first column when headers are absent. */
function namedDimension(
  row: Ga4Row,
  index: Map<string, number>,
  name: string,
): string {
  const position = index.get(name);
  return dimensionValue(row, position ?? 0);
}

/** GA4 `date` dimension is `YYYYMMDD`. */
export function formatGa4Date(value: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : value;
}

/**
 * Keeps only rows belonging to `rangeValue` when the report carries the
 * auto-added `dateRange` dimension; otherwise every row is returned.
 */
function rowsForDateRange(
  rows: Ga4Row[] | undefined,
  dimIndex: Map<string, number>,
  rangeValue: string,
): Ga4Row[] {
  const position = dimIndex.get("dateRange");
  const all = rows ?? [];

  if (position === undefined) {
    return rangeValue === DATE_RANGE_CURRENT ? all : [];
  }

  return all.filter((row) => dimensionValue(row, position) === rangeValue);
}

// --- Daily + totals ----------------------------------------------------------------------

function mapDaily(report: Ga4ReportResponse): GoogleAnalyticsDailyPoint[] {
  const metrics = metricIndex(report);
  const dims = dimensionIndex(report);

  return rowsForDateRange(report.rows, dims, DATE_RANGE_CURRENT)
    .map((row) => ({
      day: formatGa4Date(namedDimension(row, dims, "date")),
      activeUsers: metricValue(row, metrics, "activeUsers"),
      sessions: metricValue(row, metrics, "sessions"),
    }))
    .sort((left, right) => left.day.localeCompare(right.day));
}

function totalsFromRow(
  row: Ga4Row,
  metrics: Map<string, number>,
): GoogleAnalyticsTotals {
  return {
    activeUsers: metricValue(row, metrics, "activeUsers"),
    newUsers: metricValue(row, metrics, "newUsers"),
    sessions: metricValue(row, metrics, "sessions"),
    engagementRate: metricValue(row, metrics, "engagementRate"),
    averageSessionDurationSeconds: metricValue(
      row,
      metrics,
      "averageSessionDuration",
    ),
    keyEvents: metricValue(row, metrics, "keyEvents"),
    screenPageViews: metricValue(row, metrics, "screenPageViews"),
  };
}

/**
 * Totals come from the TOTAL aggregation row when present; otherwise they are
 * recomputed from the daily rows (sums for additive metrics, session-weighted
 * means for the rate/average ones). `activeUsers` summed across days
 * overcounts returning users, which is why the aggregation row is preferred.
 */
function mapTotals(
  report: Ga4ReportResponse,
  rangeValue: string,
): GoogleAnalyticsTotals | null {
  const metrics = metricIndex(report);
  const dims = dimensionIndex(report);
  const totalRow = rowsForDateRange(report.totals, dims, rangeValue)[0];

  if (totalRow) {
    return totalsFromRow(totalRow, metrics);
  }

  const rows = rowsForDateRange(report.rows, dims, rangeValue);

  if (rows.length === 0) {
    return null;
  }

  const sum = (name: string) =>
    rows.reduce((acc, row) => acc + metricValue(row, metrics, name), 0);
  const sessions = sum("sessions");
  const weighted = (name: string) =>
    sessions > 0
      ? rows.reduce(
          (acc, row) =>
            acc +
            metricValue(row, metrics, name) *
              metricValue(row, metrics, "sessions"),
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

const EMPTY_TOTALS: GoogleAnalyticsTotals = {
  activeUsers: 0,
  newUsers: 0,
  sessions: 0,
  engagementRate: 0,
  averageSessionDurationSeconds: 0,
  keyEvents: 0,
  screenPageViews: 0,
};

// --- Generic label merge -------------------------------------------------------------------

type MergedRow = { label: string; metrics: Record<string, number> };

/**
 * Groups rows by a display label, summing the named metrics. GA4 can return
 * both an empty value and a literal "(not set)" (or the same label twice);
 * they display identically, so they must become one row — a duplicate label
 * also breaks keyed rendering. Summing `activeUsers` across merged rows can
 * slightly overcount users present in both, acceptable for a top-10 table.
 * Rate metrics listed in `weightedBy` are re-averaged weighted by that metric.
 */
function mergeByLabel(
  report: Ga4ReportResponse | undefined,
  labelOf: (row: Ga4Row, dims: Map<string, number>) => string,
  metricNames: readonly string[],
  weightedBy: { metric: string; weight: string }[] = [],
): MergedRow[] {
  if (!report) {
    return [];
  }

  const metrics = metricIndex(report);
  const dims = dimensionIndex(report);
  const merged = new Map<string, MergedRow>();

  for (const row of report.rows ?? []) {
    const label = labelOf(row, dims).trim() || "(not set)";
    const values: Record<string, number> = {};
    for (const name of metricNames) {
      values[name] = metricValue(row, metrics, name);
    }
    // Carry weighted sums so rates can be re-averaged after merging.
    for (const { metric, weight } of weightedBy) {
      values[`${metric}__weighted`] = values[metric] * values[weight];
    }

    const existing = merged.get(label);
    if (existing) {
      for (const key of Object.keys(values)) {
        existing.metrics[key] = (existing.metrics[key] ?? 0) + values[key];
      }
    } else {
      merged.set(label, { label, metrics: values });
    }
  }

  for (const row of merged.values()) {
    for (const { metric, weight } of weightedBy) {
      const total = row.metrics[weight];
      row.metrics[metric] =
        total > 0 ? row.metrics[`${metric}__weighted`] / total : 0;
      delete row.metrics[`${metric}__weighted`];
    }
  }

  return [...merged.values()];
}

function firstDimension(row: Ga4Row): string {
  return dimensionValue(row, 0);
}

function mapBreakdown(
  report: Ga4ReportResponse | undefined,
): GoogleAnalyticsBreakdownRow[] {
  return mergeByLabel(report, firstDimension, BREAKDOWN_METRICS)
    .map((row) => ({
      label: row.label,
      sessions: row.metrics.sessions,
      activeUsers: row.metrics.activeUsers,
    }))
    .sort((left, right) => right.sessions - left.sessions);
}

function mapCampaigns(
  report: Ga4ReportResponse | undefined,
): GoogleAnalyticsCampaignRow[] {
  const SEPARATOR = "\u0000";

  return mergeByLabel(
    report,
    (row, dims) =>
      `${namedDimension(row, dims, "sessionSourceMedium").trim() || "(not set)"}${SEPARATOR}${
        namedDimension(row, dims, "sessionCampaignName").trim() || "(not set)"
      }`,
    ["sessions", "engagementRate", "keyEvents"],
    [{ metric: "engagementRate", weight: "sessions" }],
  )
    .map((row) => {
      const [sourceMedium, campaign] = row.label.split(SEPARATOR);
      return {
        sourceMedium,
        campaign,
        sessions: row.metrics.sessions,
        engagementRate: row.metrics.engagementRate,
        keyEvents: row.metrics.keyEvents,
      };
    })
    .sort((left, right) => right.sessions - left.sessions);
}

function mapLandingPages(
  report: Ga4ReportResponse | undefined,
): GoogleAnalyticsLandingPageRow[] {
  return mergeByLabel(report, firstDimension, [
    "sessions",
    "newUsers",
    "userEngagementDuration",
    "keyEvents",
  ])
    .map((row) => ({
      path: row.label,
      sessions: row.metrics.sessions,
      newUsers: row.metrics.newUsers,
      avgEngagementSeconds:
        row.metrics.sessions > 0
          ? row.metrics.userEngagementDuration / row.metrics.sessions
          : 0,
      keyEvents: row.metrics.keyEvents,
    }))
    .sort((left, right) => right.sessions - left.sessions);
}

/** Always 7 × 24 cells, ordered Sunday(0)→Saturday(6), hour 0→23. */
function mapHeatmap(
  report: Ga4ReportResponse | undefined,
): GoogleAnalyticsHeatmapCell[] {
  const grid = new Map<string, number>();

  if (report) {
    const metrics = metricIndex(report);
    const dims = dimensionIndex(report);

    for (const row of report.rows ?? []) {
      const day = Number.parseInt(namedDimension(row, dims, "dayOfWeek"), 10);
      const hour = Number.parseInt(namedDimension(row, dims, "hour"), 10);
      if (day < 0 || day > 6 || hour < 0 || hour > 23) continue;
      const key = `${day}:${hour}`;
      grid.set(
        key,
        (grid.get(key) ?? 0) + metricValue(row, metrics, "sessions"),
      );
    }
  }

  const cells: GoogleAnalyticsHeatmapCell[] = [];
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      cells.push({
        dayOfWeek,
        hour,
        sessions: grid.get(`${dayOfWeek}:${hour}`) ?? 0,
      });
    }
  }
  return cells;
}

function mapNewVsReturning(
  report: Ga4ReportResponse | undefined,
): GoogleAnalyticsAudienceSegment[] {
  const order = ["new", "returning", "(not set)"];

  return (
    mergeByLabel(
      report,
      firstDimension,
      ["activeUsers", "sessions", "engagementRate"],
      [{ metric: "engagementRate", weight: "sessions" }],
    )
      .map((row) => ({
        label: row.label,
        activeUsers: row.metrics.activeUsers,
        sessions: row.metrics.sessions,
        engagementRate: row.metrics.engagementRate,
      }))
      // An empty "(not set)" bucket is noise in a two-segment donut.
      .filter((segment) => segment.activeUsers > 0)
      .sort(
        (left, right) =>
          (order.indexOf(left.label) + 1 || 99) -
          (order.indexOf(right.label) + 1 || 99),
      )
  );
}

function mapKeyEvents(
  report: Ga4ReportResponse | undefined,
): GoogleAnalyticsKeyEventRow[] {
  return mergeByLabel(report, firstDimension, ["keyEvents"])
    .map((row) => ({ eventName: row.label, keyEvents: row.metrics.keyEvents }))
    .filter((row) => row.keyEvents > 0)
    .sort((left, right) => right.keyEvents - left.keyEvents);
}

export function mapDashboardResponse(
  reports: Ga4ReportResponse[],
): GoogleAnalyticsDashboard {
  const byKey = Object.fromEntries(
    DASHBOARD_REPORT_ORDER.map((key, position) => [key, reports[position]]),
  ) as Record<DashboardReportKey, Ga4ReportResponse | undefined>;
  const dailyReport = byKey.daily ?? {};

  return {
    totals: mapTotals(dailyReport, DATE_RANGE_CURRENT) ?? EMPTY_TOTALS,
    previousTotals: mapTotals(dailyReport, DATE_RANGE_PREVIOUS),
    daily: mapDaily(dailyReport),
    channels: mapBreakdown(byKey.channels),
    pages: mapBreakdown(byKey.pages),
    devices: mapBreakdown(byKey.devices),
    countries: mapBreakdown(byKey.countries),
    cities: mapBreakdown(byKey.cities),
    campaigns: mapCampaigns(byKey.campaigns),
    landingPages: mapLandingPages(byKey.landingPages),
    heatmap: mapHeatmap(byKey.heatmap),
    newVsReturning: mapNewVsReturning(byKey.newVsReturning),
    keyEventsByName: mapKeyEvents(byKey.keyEventsByName),
  };
}

// --- Realtime ------------------------------------------------------------------------------

export const REALTIME_MINUTES = 30;

/**
 * Three realtime requests (there is no realtime batch endpoint): the headline
 * total, the per-minute series and the top pages. The total is its own
 * request because a user active in several minutes would be counted in each.
 */
export function buildRealtimeRequests(): Ga4RealtimeRequest[] {
  const minuteRanges = [{ startMinutesAgo: REALTIME_MINUTES - 1 }];

  return [
    { metrics: [{ name: "activeUsers" }], minuteRanges },
    {
      dimensions: [{ name: "minutesAgo" }],
      metrics: [{ name: "activeUsers" }],
      minuteRanges,
      limit: REALTIME_MINUTES,
    },
    {
      dimensions: [{ name: "unifiedScreenName" }],
      metrics: [{ name: "activeUsers" }],
      minuteRanges,
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit: 5,
    },
  ];
}

export function mapRealtimeResponse(
  reports: Ga4ReportResponse[],
  fetchedAt: Date = new Date(),
): GoogleAnalyticsRealtime {
  const [total, perMinuteReport, pagesReport] = reports;

  const totalMetrics = metricIndex(total ?? {});
  const activeUsers = metricValue(
    total?.rows?.[0],
    totalMetrics,
    "activeUsers",
  );

  const byMinute = new Map<number, number>();
  if (perMinuteReport) {
    const metrics = metricIndex(perMinuteReport);
    for (const row of perMinuteReport.rows ?? []) {
      const minute = Number.parseInt(dimensionValue(row), 10);
      if (minute >= 0 && minute < REALTIME_MINUTES) {
        byMinute.set(
          minute,
          (byMinute.get(minute) ?? 0) +
            metricValue(row, metrics, "activeUsers"),
        );
      }
    }
  }

  const perMinute = Array.from({ length: REALTIME_MINUTES }, (_, minute) => ({
    minutesAgo: minute,
    activeUsers: byMinute.get(minute) ?? 0,
  }));

  const topPages = mergeByLabel(pagesReport, firstDimension, ["activeUsers"])
    .map((row) => ({ title: row.label, activeUsers: row.metrics.activeUsers }))
    .sort((left, right) => right.activeUsers - left.activeUsers)
    .slice(0, 5);

  return {
    activeUsers,
    perMinute,
    topPages,
    fetchedAt: fetchedAt.toISOString(),
  };
}
