import { RequestContext } from "@mastra/core/request-context";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ga4ReportResponse } from "../../../services/google-analytics/ga4-client.server";
import type { GoogleAnalyticsDashboard } from "../../../services/google-analytics/google-analytics";
import {
  GOOGLE_ANALYTICS_SCOPE_RUNTIME_KEY,
  type GoogleAnalyticsScopeEntry,
} from "../chat-registry";
import {
  setGoogleAnalyticsGateway,
  type GoogleAnalyticsGateway,
  type GoogleAnalyticsGatewayOutcome,
} from "./google-analytics-gateway";
import {
  authorizeProperty,
  compactDashboard,
  flattenRows,
  getGoogleAnalyticsOverview,
  listGoogleAnalyticsProperties,
  REFUSAL_SENTENCE,
  REPORT_DEFAULT_ROWS,
  REPORT_MAX_DIMENSIONS,
  REPORT_MAX_ROWS,
  runGoogleAnalyticsRealtimeReport,
  runGoogleAnalyticsReport,
  runReportInputSchema,
  searchGoogleAnalyticsFields,
  toGa4Filter,
} from "./google-analytics-tools";

const scopeEntries: GoogleAnalyticsScopeEntry[] = [
  {
    brandId: 22,
    brandName: "Pizza Hut",
    propertyRowId: "row_ph",
    propertyId: "111",
    displayName: "Pizza Hut web",
  },
  {
    brandId: 7,
    brandName: "KFC",
    propertyRowId: "row_kfc",
    propertyId: "222",
    displayName: "KFC web",
  },
];

const ok = <T>(value: T): GoogleAnalyticsGatewayOutcome<T> => ({
  ok: true,
  value,
});

const channelReport: Ga4ReportResponse = {
  dimensionHeaders: [{ name: "sessionDefaultChannelGroup" }],
  metricHeaders: [
    { name: "sessions", type: "TYPE_INTEGER" },
    { name: "engagementRate", type: "TYPE_FLOAT" },
  ],
  rows: [
    {
      dimensionValues: [{ value: "Organic Search" }],
      metricValues: [{ value: "1200" }, { value: "0.61" }],
    },
    {
      dimensionValues: [{ value: "Direct" }],
      metricValues: [{ value: "800" }, { value: "0.5" }],
    },
  ],
  totals: [
    {
      dimensionValues: [{ value: "RESERVED_TOTAL" }],
      metricValues: [{ value: "2000" }, { value: "0.566" }],
    },
  ],
  rowCount: 2,
  propertyQuota: {
    tokensPerDay: { consumed: 12, remaining: 199_988 },
    tokensPerHour: { consumed: 12, remaining: 39_988 },
  },
};

const emptyTotals = {
  activeUsers: 0,
  newUsers: 0,
  sessions: 0,
  engagementRate: 0,
  averageSessionDurationSeconds: 0,
  keyEvents: 0,
  screenPageViews: 0,
};

const dashboard: GoogleAnalyticsDashboard = {
  totals: { ...emptyTotals, activeUsers: 500, sessions: 1000, keyEvents: 20 },
  previousTotals: {
    ...emptyTotals,
    activeUsers: 400,
    sessions: 800,
    keyEvents: 0,
  },
  daily: [{ day: "2026-10-14", activeUsers: 50, sessions: 100 }],
  channels: Array.from({ length: 8 }, (_, index) => ({
    label: `Channel ${index}`,
    sessions: 100 - index,
    activeUsers: 50 - index,
  })),
  pages: [],
  devices: [{ label: "mobile", sessions: 700, activeUsers: 350 }],
  countries: [],
  cities: [],
  campaigns: [],
  landingPages: [],
  heatmap: [
    { dayOfWeek: 1, hour: 12, sessions: 40 },
    { dayOfWeek: 5, hour: 20, sessions: 90 },
    { dayOfWeek: 0, hour: 3, sessions: 1 },
  ],
  newVsReturning: [],
  keyEventsByName: [],
};

function fakeGateway(overrides: Partial<GoogleAnalyticsGateway> = {}) {
  const gateway: GoogleAnalyticsGateway = {
    runReport: vi.fn(async () => ok(channelReport)),
    runRealtimeReport: vi.fn(async () =>
      ok({
        metricHeaders: [{ name: "activeUsers" }],
        rows: [{ metricValues: [{ value: "7" }] }],
      } satisfies Ga4ReportResponse),
    ),
    getMetadata: vi.fn(async () =>
      ok({
        dimensions: [
          {
            apiName: "sessionCampaignName",
            uiName: "Session campaign",
            description: "The marketing campaign name of the session.",
          },
          { apiName: "country", uiName: "Country" },
        ],
        metrics: [
          {
            apiName: "keyEvents",
            uiName: "Key events",
            description: "Count of key events.",
            type: "TYPE_INTEGER",
          },
          {
            apiName: "totalRevenue",
            uiName: "Total revenue",
            description: "Revenue from purchases, subscriptions and ads.",
            type: "TYPE_CURRENCY",
          },
        ],
      }),
    ),
    getDashboard: vi.fn(async () => ok(dashboard)),
    ...overrides,
  };
  setGoogleAnalyticsGateway(gateway);
  return gateway;
}

function scoped(entries: GoogleAnalyticsScopeEntry[] = scopeEntries) {
  const requestContext = new RequestContext();
  requestContext.set(GOOGLE_ANALYTICS_SCOPE_RUNTIME_KEY, entries);
  return { requestContext };
}

/** Direct `execute` calls bypass Mastra's runtime typing of the context. */
function ctx(value: { requestContext?: RequestContext }) {
  return value as never;
}

type Failure = { ok: false; code: string; error: string; retryable?: boolean };

async function call<T>(promise: Promise<unknown>): Promise<T | Failure> {
  return (await promise) as T | Failure;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  setGoogleAnalyticsGateway(null);
});

describe("authorizeProperty", () => {
  it("fails closed when no scope was published", () => {
    expect(authorizeProperty("row_ph", undefined)).toMatchObject({
      ok: false,
      code: "SCOPE_MISSING",
    });
  });

  it("refuses when the user has no properties", () => {
    expect(
      authorizeProperty("row_ph", scoped([]).requestContext),
    ).toMatchObject({ ok: false, code: "NO_PROPERTIES" });
  });

  it("ignores malformed scope entries instead of trusting them", () => {
    const requestContext = new RequestContext();
    requestContext.set(GOOGLE_ANALYTICS_SCOPE_RUNTIME_KEY, [
      { propertyRowId: "row_x" },
    ]);
    expect(authorizeProperty("row_x", requestContext)).toMatchObject({
      ok: false,
      code: "NO_PROPERTIES",
    });
  });

  it("refuses an id outside the scope with the exact refusal sentence", () => {
    const result = authorizeProperty("row_other", scoped().requestContext);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FORBIDDEN");
      expect(result.error.endsWith(REFUSAL_SENTENCE)).toBe(true);
    }
  });

  it("returns the scope entry for an in-scope id", () => {
    expect(authorizeProperty(" row_kfc ", scoped().requestContext)).toEqual({
      ok: true,
      property: scopeEntries[1],
    });
  });
});

describe("listGoogleAnalyticsProperties", () => {
  it("groups properties by brand without touching the gateway", async () => {
    const gateway = fakeGateway();
    const result = await call<{ ok: true; brands: unknown[] }>(
      listGoogleAnalyticsProperties.execute!({}, ctx(scoped())),
    );
    expect(result).toEqual({
      ok: true,
      brands: [
        {
          brandId: 22,
          brandName: "Pizza Hut",
          properties: [
            {
              propertyRowId: "row_ph",
              displayName: "Pizza Hut web",
              ga4PropertyId: "111",
            },
          ],
        },
        {
          brandId: 7,
          brandName: "KFC",
          properties: [
            {
              propertyRowId: "row_kfc",
              displayName: "KFC web",
              ga4PropertyId: "222",
            },
          ],
        },
      ],
    });
    expect(gateway.getDashboard).not.toHaveBeenCalled();
  });
});

describe("gateway not installed", () => {
  it("fails closed without calling anything", async () => {
    const result = await call<{ ok: true }>(
      runGoogleAnalyticsReport.execute!(
        {
          propertyRowId: "row_ph",
          dimensions: [],
          metrics: ["sessions"],
          dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
          limit: 10,
        },
        ctx(scoped()),
      ),
    );
    expect(result).toMatchObject({ ok: false, code: "GATEWAY_UNAVAILABLE" });
  });
});

describe("runReportInputSchema", () => {
  it("caps dimensions, metrics, date ranges and rows", () => {
    const base = {
      propertyRowId: "row_ph",
      metrics: ["sessions"],
      dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
    };
    expect(
      runReportInputSchema.safeParse({
        ...base,
        dimensions: Array.from(
          { length: REPORT_MAX_DIMENSIONS + 1 },
          (_, i) => `d${i}`,
        ),
      }).success,
    ).toBe(false);
    expect(
      runReportInputSchema.safeParse({ ...base, limit: REPORT_MAX_ROWS + 1 })
        .success,
    ).toBe(false);
    expect(
      runReportInputSchema.safeParse({
        ...base,
        dateRanges: [
          { startDate: "7daysAgo", endDate: "yesterday" },
          { startDate: "14daysAgo", endDate: "8daysAgo" },
          { startDate: "21daysAgo", endDate: "15daysAgo" },
        ],
      }).success,
    ).toBe(false);
    expect(
      runReportInputSchema.safeParse({ ...base, metrics: [] }).success,
    ).toBe(false);
  });

  it("rejects malformed dates and field names", () => {
    const base = { propertyRowId: "row_ph", metrics: ["sessions"] };
    expect(
      runReportInputSchema.safeParse({
        ...base,
        dateRanges: [{ startDate: "last week", endDate: "yesterday" }],
      }).success,
    ).toBe(false);
    expect(
      runReportInputSchema.safeParse({
        ...base,
        metrics: ["sessions; drop"],
        dateRanges: [{ startDate: "2026-09-01", endDate: "2026-09-30" }],
      }).success,
    ).toBe(false);
    expect(
      runReportInputSchema.safeParse({
        ...base,
        metrics: ["customEvent:scroll_depth"],
        dateRanges: [{ startDate: "2026-09-01", endDate: "2026-09-30" }],
      }).success,
    ).toBe(true);
  });

  it("applies the defaults", () => {
    const parsed = runReportInputSchema.parse({
      propertyRowId: "row_ph",
      metrics: ["sessions"],
      dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
    });
    expect(parsed.dimensions).toEqual([]);
    expect(parsed.limit).toBe(REPORT_DEFAULT_ROWS);
  });

  it("requires exactly one member per filter expression", () => {
    const base = {
      propertyRowId: "row_ph",
      metrics: ["sessions"],
      dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
    };
    expect(
      runReportInputSchema.safeParse({
        ...base,
        dimensionFilter: {
          filter: { fieldName: "country", stringFilter: { value: "Cyprus" } },
          notExpression: {
            filter: { fieldName: "city", stringFilter: { value: "X" } },
          },
        },
      }).success,
    ).toBe(false);
    expect(
      runReportInputSchema.safeParse({
        ...base,
        dimensionFilter: {
          andGroup: {
            expressions: [
              {
                filter: {
                  fieldName: "country",
                  stringFilter: { matchType: "EXACT", value: "Cyprus" },
                },
              },
              {
                notExpression: {
                  filter: {
                    fieldName: "deviceCategory",
                    inListFilter: { values: ["tablet"] },
                  },
                },
              },
            ],
          },
        },
      }).success,
    ).toBe(true);
  });
});

describe("toGa4Filter", () => {
  it("converts plain numbers into GA4 numeric values", () => {
    expect(
      toGa4Filter({
        filter: {
          fieldName: "sessions",
          numericFilter: { operation: "GREATER_THAN", value: 10 },
        },
      }),
    ).toEqual({
      filter: {
        fieldName: "sessions",
        numericFilter: {
          operation: "GREATER_THAN",
          value: { int64Value: "10" },
        },
      },
    });
    expect(
      toGa4Filter({
        filter: {
          fieldName: "engagementRate",
          betweenFilter: { fromValue: 0.5, toValue: { doubleValue: 0.9 } },
        },
      }),
    ).toEqual({
      filter: {
        fieldName: "engagementRate",
        betweenFilter: {
          fromValue: { doubleValue: 0.5 },
          toValue: { doubleValue: 0.9 },
        },
      },
    });
  });
});

describe("flattenRows", () => {
  it("keys cells by header name, parses metrics and formats dates", () => {
    const report: Ga4ReportResponse = {
      dimensionHeaders: [{ name: "date" }, { name: "dateRange" }],
      metricHeaders: [{ name: "sessions" }],
      rows: [
        {
          dimensionValues: [{ value: "20261014" }, { value: "date_range_0" }],
          metricValues: [{ value: "42" }],
        },
      ],
    };
    expect(flattenRows(report, report.rows)).toEqual([
      { date: "2026-10-14", dateRange: "date_range_0", sessions: 42 },
    ]);
  });

  it("drops reserved/empty dimension cells from totals rows only", () => {
    expect(
      flattenRows(channelReport, channelReport.totals, {
        skipEmptyDimensions: true,
      }),
    ).toEqual([{ sessions: 2000, engagementRate: 0.566 }]);
    expect(flattenRows(channelReport, channelReport.rows)[0]).toEqual({
      sessionDefaultChannelGroup: "Organic Search",
      sessions: 1200,
      engagementRate: 0.61,
    });
  });
});

describe("runGoogleAnalyticsReport", () => {
  it("never reaches the gateway for an out-of-scope property", async () => {
    const gateway = fakeGateway();
    const result = await call<{ ok: true }>(
      runGoogleAnalyticsReport.execute!(
        {
          propertyRowId: "row_other",
          dimensions: [],
          metrics: ["sessions"],
          dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
          limit: 10,
        },
        ctx(scoped()),
      ),
    );
    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(gateway.runReport).not.toHaveBeenCalled();
  });

  it("builds the GA4 body, defaults the sort, and flattens the answer", async () => {
    const gateway = fakeGateway();
    const result = await call<{
      ok: true;
      rows: Record<string, unknown>[];
      totals: Record<string, unknown>[];
      rowCount: number;
      truncated: boolean;
      quota?: unknown;
    }>(
      runGoogleAnalyticsReport.execute!(
        {
          propertyRowId: "row_ph",
          dimensions: ["sessionDefaultChannelGroup"],
          metrics: ["sessions", "engagementRate"],
          dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }],
          dimensionFilter: {
            filter: {
              fieldName: "country",
              stringFilter: { matchType: "EXACT", value: "Cyprus" },
            },
          },
          limit: 10,
        },
        ctx(scoped()),
      ),
    );

    expect(gateway.runReport).toHaveBeenCalledWith("row_ph", {
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "engagementRate" }],
      dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }],
      dimensionFilter: {
        filter: {
          fieldName: "country",
          stringFilter: { matchType: "EXACT", value: "Cyprus" },
        },
      },
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
      metricAggregations: ["TOTAL"],
      returnPropertyQuota: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({
        sessionDefaultChannelGroup: "Organic Search",
        sessions: 1200,
        engagementRate: 0.61,
      });
      expect(result.totals).toEqual([
        { sessions: 2000, engagementRate: 0.566 },
      ]);
      expect(result.rowCount).toBe(2);
      expect(result.truncated).toBe(false);
      expect(result.quota).toEqual({
        tokensPerDay: { consumed: 12, remaining: 199_988 },
        tokensPerHour: { consumed: 12, remaining: 39_988 },
      });
    }
  });

  it("flags truncation from Google's rowCount and explains empty results", async () => {
    fakeGateway({
      runReport: vi.fn(async () => ok({ ...channelReport, rowCount: 57 })),
    });
    const truncated = await call<{ ok: true; truncated: boolean }>(
      runGoogleAnalyticsReport.execute!(
        {
          propertyRowId: "row_ph",
          dimensions: ["city"],
          metrics: ["sessions"],
          dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
          limit: 2,
        },
        ctx(scoped()),
      ),
    );
    expect(truncated).toMatchObject({ ok: true, truncated: true });

    fakeGateway({
      runReport: vi.fn(async () => ok({ rows: [], rowCount: 0 })),
    });
    const empty = await call<{ ok: true; rows: unknown[]; note: string }>(
      runGoogleAnalyticsReport.execute!(
        {
          propertyRowId: "row_ph",
          dimensions: [],
          metrics: ["sessions"],
          dateRanges: [{ startDate: "today", endDate: "today" }],
          limit: 10,
        },
        ctx(scoped()),
      ),
    );
    expect(empty.ok).toBe(true);
    if (empty.ok) {
      expect(empty.rows).toEqual([]);
      expect(empty.note).toMatch(/thresholds/);
    }
  });

  it("passes Google's INVALID_ARGUMENT wording through with a retry hint", async () => {
    fakeGateway({
      runReport: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: "INVALID_ARGUMENT",
          message: "Field sesions is not a valid metric.",
          status: 400,
          retryable: false,
        },
      })),
    });
    const result = await call<{ ok: true }>(
      runGoogleAnalyticsReport.execute!(
        {
          propertyRowId: "row_ph",
          dimensions: [],
          metrics: ["sesions"],
          dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
          limit: 10,
        },
        ctx(scoped()),
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_ARGUMENT");
      expect(result.error).toContain("Field sesions is not a valid metric.");
      expect(result.error).toContain("searchGoogleAnalyticsFields");
    }
  });
});

describe("runGoogleAnalyticsRealtimeReport", () => {
  it("asks for the last 30 minutes and flattens the headline", async () => {
    const gateway = fakeGateway();
    const result = await call<{ ok: true; rows: unknown[]; window: string }>(
      runGoogleAnalyticsRealtimeReport.execute!(
        {
          propertyRowId: "row_kfc",
          dimensions: [],
          metrics: ["activeUsers"],
          limit: 10,
        },
        ctx(scoped()),
      ),
    );
    expect(gateway.runRealtimeReport).toHaveBeenCalledWith("row_kfc", {
      dimensions: [],
      metrics: [{ name: "activeUsers" }],
      minuteRanges: [{ startMinutesAgo: 29 }],
      limit: 10,
    });
    expect(result).toMatchObject({
      ok: true,
      window: "last 30 minutes",
      rows: [{ activeUsers: 7 }],
    });
  });
});

describe("getGoogleAnalyticsOverview + compactDashboard", () => {
  it("returns the compacted dashboard with deltas and top-5 lists", async () => {
    const gateway = fakeGateway();
    const result = await call<{
      ok: true;
      range: string;
      dashboard: ReturnType<typeof compactDashboard>;
    }>(
      getGoogleAnalyticsOverview.execute!(
        { propertyRowId: "row_ph", range: "7d" },
        ctx(scoped()),
      ),
    );
    expect(gateway.getDashboard).toHaveBeenCalledWith("row_ph", "7d");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.range).toBe("7d");
      expect(result.dashboard.totals.sessions).toEqual({
        current: 1000,
        previous: 800,
        changePct: 25,
      });
      // Previous period had no key events → change is undefined, not +∞.
      expect(result.dashboard.totals.keyEvents.changePct).toBeNull();
      expect(result.dashboard.channels).toHaveLength(5);
      expect(result.dashboard.busiestHours[0]).toEqual({
        dayOfWeek: 5,
        hour: 20,
        sessions: 90,
      });
    }
  });
});

describe("searchGoogleAnalyticsFields", () => {
  it("filters metadata by substring across name, label and description", async () => {
    fakeGateway();
    const result = await call<{
      ok: true;
      totalMatches: number;
      dimensions: { apiName: string }[];
      metrics: { apiName: string }[];
    }>(
      searchGoogleAnalyticsFields.execute!(
        { propertyRowId: "row_ph", query: "campaign", kind: "both" },
        ctx(scoped()),
      ),
    );
    expect(result).toMatchObject({ ok: true, totalMatches: 1 });
    if (result.ok) {
      expect(result.dimensions.map((d) => d.apiName)).toEqual([
        "sessionCampaignName",
      ]);
      expect(result.metrics).toEqual([]);
    }

    const revenue = await call<{ ok: true; metrics: { apiName: string }[] }>(
      searchGoogleAnalyticsFields.execute!(
        { propertyRowId: "row_ph", query: "revenue", kind: "metrics" },
        ctx(scoped()),
      ),
    );
    expect(revenue.ok).toBe(true);
    if (revenue.ok) {
      expect(revenue.metrics.map((m) => m.apiName)).toEqual(["totalRevenue"]);
    }
  });
});
