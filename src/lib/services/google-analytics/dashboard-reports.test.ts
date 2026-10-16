import { describe, expect, it } from "vitest";
import {
  buildDashboardBatches,
  buildDashboardRequests,
  buildRealtimeRequests,
  DASHBOARD_REPORT_ORDER,
  formatGa4Date,
  mapDashboardResponse,
  mapRealtimeResponse,
  previousDateRangeFor,
  REALTIME_MINUTES,
  REPORTS_PER_BATCH,
  TOTALS_METRICS,
} from "./dashboard-reports";
import type { Ga4ReportResponse } from "./ga4-client.server";

function metricHeaders(names: readonly string[]) {
  return names.map((name) => ({ name, type: "TYPE_INTEGER" }));
}

function dimensionHeaders(names: readonly string[]) {
  return names.map((name) => ({ name }));
}

function row(dimensions: string | string[], metrics: (number | string)[]) {
  return {
    dimensionValues: (Array.isArray(dimensions)
      ? dimensions
      : [dimensions]
    ).map((value) => ({ value })),
    metricValues: metrics.map((value) => ({ value: String(value) })),
  };
}

/** Daily report with two date ranges, as GA4 returns it (dateRange column). */
const dailyReport: Ga4ReportResponse = {
  dimensionHeaders: dimensionHeaders(["date", "dateRange"]),
  metricHeaders: metricHeaders(TOTALS_METRICS),
  // Deliberately out of order to prove the mapper sorts by day.
  rows: [
    row(["20261015", "date_range_0"], [120, 40, 150, 0.6, 100, 5, 400]),
    row(["20261014", "date_range_0"], [100, 30, 130, 0.5, 80, 3, 300]),
    row(["20260917", "date_range_1"], [90, 20, 110, 0.4, 70, 2, 250]),
  ],
  totals: [
    row(["RESERVED_TOTAL", "date_range_0"], [200, 70, 280, 0.55, 90, 8, 700]),
    row(["RESERVED_TOTAL", "date_range_1"], [150, 50, 200, 0.5, 85, 4, 500]),
  ],
  rowCount: 3,
};

const channelsReport: Ga4ReportResponse = {
  dimensionHeaders: dimensionHeaders(["sessionDefaultChannelGroup"]),
  metricHeaders: metricHeaders(["sessions", "activeUsers"]),
  rows: [row("Organic Search", [180, 120]), row("", [100, 80])],
};

function reportsWith(
  overrides: Partial<
    Record<(typeof DASHBOARD_REPORT_ORDER)[number], Ga4ReportResponse>
  >,
): Ga4ReportResponse[] {
  return DASHBOARD_REPORT_ORDER.map((key) => overrides[key] ?? {});
}

describe("date ranges", () => {
  it("compares with the equal-length period immediately before", () => {
    expect(previousDateRangeFor("7d")).toEqual({
      startDate: "14daysAgo",
      endDate: "8daysAgo",
    });
    expect(previousDateRangeFor("28d")).toEqual({
      startDate: "56daysAgo",
      endDate: "29daysAgo",
    });
    expect(previousDateRangeFor("90d")).toEqual({
      startDate: "180daysAgo",
      endDate: "91daysAgo",
    });
  });
});

describe("buildDashboardRequests", () => {
  it("builds eleven reports in the documented order", () => {
    const requests = buildDashboardRequests("28d");

    expect(requests).toHaveLength(DASHBOARD_REPORT_ORDER.length);
    expect(requests[0].dimensions).toEqual([{ name: "date" }]);
    expect(requests[0].metricAggregations).toEqual(["TOTAL"]);
    expect(requests[0].dateRanges).toEqual([
      { startDate: "28daysAgo", endDate: "yesterday" },
      { startDate: "56daysAgo", endDate: "29daysAgo" },
    ]);
    expect(
      requests.slice(1, 5).map((request) => request.dimensions?.[0].name),
    ).toEqual([
      "sessionDefaultChannelGroup",
      "unifiedScreenName",
      "deviceCategory",
      "country",
    ]);
    for (const request of requests.slice(1, 5)) {
      expect(request.limit).toBe(10);
      expect(request.dateRanges).toHaveLength(1);
      expect(request.orderBys).toEqual([
        { metric: { metricName: "sessions" }, desc: true },
      ]);
    }
    expect(requests[5].dimensions?.map((d) => d.name)).toEqual([
      "sessionSourceMedium",
      "sessionCampaignName",
    ]);
    expect(requests[6].dimensions?.[0].name).toBe("landingPage");
    expect(requests[7].dimensions?.map((d) => d.name)).toEqual([
      "dayOfWeek",
      "hour",
    ]);
    expect(requests[7].limit).toBe(168);
    expect(requests[8].dimensions?.[0].name).toBe("newVsReturning");
    expect(requests[9].dimensions?.[0].name).toBe("eventName");
    expect(requests[9].metricFilter?.filter.fieldName).toBe("keyEvents");
    expect(requests[10].dimensions?.[0].name).toBe("city");
  });

  it("splits into batches the API accepts", () => {
    const batches = buildDashboardBatches("7d");

    expect(batches.map((batch) => batch.length)).toEqual([5, 5, 1]);
    expect(batches.flat()).toEqual(buildDashboardRequests("7d"));
    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(REPORTS_PER_BATCH);
    }
  });
});

describe("mapDashboardResponse", () => {
  it("prefers the TOTAL aggregation row of the current range for the tiles", () => {
    const dashboard = mapDashboardResponse(
      reportsWith({ daily: dailyReport, channels: channelsReport }),
    );

    expect(dashboard.totals).toEqual({
      activeUsers: 200,
      newUsers: 70,
      sessions: 280,
      engagementRate: 0.55,
      averageSessionDurationSeconds: 90,
      keyEvents: 8,
      screenPageViews: 700,
    });
  });

  it("reads the previous period from the second range's TOTAL row", () => {
    const dashboard = mapDashboardResponse(reportsWith({ daily: dailyReport }));

    expect(dashboard.previousTotals).toEqual({
      activeUsers: 150,
      newUsers: 50,
      sessions: 200,
      engagementRate: 0.5,
      averageSessionDurationSeconds: 85,
      keyEvents: 4,
      screenPageViews: 500,
    });
  });

  it("limits the daily series to the current range, sorted, with ISO dates", () => {
    const dashboard = mapDashboardResponse(reportsWith({ daily: dailyReport }));

    expect(dashboard.daily).toEqual([
      { day: "2026-10-14", activeUsers: 100, sessions: 130 },
      { day: "2026-10-15", activeUsers: 120, sessions: 150 },
    ]);
  });

  it("still works for a single-range report without a dateRange column", () => {
    const single: Ga4ReportResponse = {
      dimensionHeaders: dimensionHeaders(["date"]),
      metricHeaders: metricHeaders(TOTALS_METRICS),
      rows: [row("20261015", [120, 40, 150, 0.6, 100, 5, 400])],
      totals: [row("RESERVED_TOTAL", [120, 40, 150, 0.6, 100, 5, 400])],
    };
    const dashboard = mapDashboardResponse(reportsWith({ daily: single }));

    expect(dashboard.totals.sessions).toBe(150);
    expect(dashboard.previousTotals).toBeNull();
    expect(dashboard.daily).toHaveLength(1);
  });

  it("falls back to session-weighted totals when the aggregation rows are missing", () => {
    const { totals: _ignored, ...withoutTotals } = dailyReport;
    const dashboard = mapDashboardResponse(
      reportsWith({ daily: withoutTotals }),
    );

    expect(dashboard.totals.sessions).toBe(280);
    expect(dashboard.totals.newUsers).toBe(70);
    // (0.6*150 + 0.5*130) / 280
    expect(dashboard.totals.engagementRate).toBeCloseTo(0.5536, 3);
    // (100*150 + 80*130) / 280
    expect(dashboard.totals.averageSessionDurationSeconds).toBeCloseTo(
      90.71,
      1,
    );
    expect(dashboard.previousTotals?.sessions).toBe(110);
  });

  it("maps breakdowns and labels empty dimension values", () => {
    const dashboard = mapDashboardResponse(
      reportsWith({ daily: dailyReport, channels: channelsReport }),
    );

    expect(dashboard.channels).toEqual([
      { label: "Organic Search", sessions: 180, activeUsers: 120 },
      { label: "(not set)", sessions: 100, activeUsers: 80 },
    ]);
    expect(dashboard.pages).toEqual([]);
    expect(dashboard.cities).toEqual([]);
  });

  it("merges rows whose labels collapse to the same value", () => {
    const report: Ga4ReportResponse = {
      metricHeaders: metricHeaders(["sessions", "activeUsers"]),
      rows: [
        row("(not set)", [10, 8]),
        row("Direct", [50, 40]),
        row("", [5, 4]),
      ],
    };
    const dashboard = mapDashboardResponse(reportsWith({ channels: report }));

    expect(dashboard.channels).toEqual([
      { label: "Direct", sessions: 50, activeUsers: 40 },
      { label: "(not set)", sessions: 15, activeUsers: 12 },
    ]);
  });

  it("maps campaigns with a session-weighted engagement rate", () => {
    const campaigns: Ga4ReportResponse = {
      dimensionHeaders: dimensionHeaders([
        "sessionSourceMedium",
        "sessionCampaignName",
      ]),
      metricHeaders: metricHeaders(["sessions", "engagementRate", "keyEvents"]),
      rows: [
        row(["google / cpc", "spring_sale"], [100, 0.8, 10]),
        row(["google / cpc", "spring_sale"], [100, 0.4, 2]),
        row(["(direct) / (none)", "(not set)"], [500, 0.6, 20]),
      ],
    };
    const dashboard = mapDashboardResponse(reportsWith({ campaigns }));

    expect(dashboard.campaigns).toEqual([
      {
        sourceMedium: "(direct) / (none)",
        campaign: "(not set)",
        sessions: 500,
        engagementRate: 0.6,
        keyEvents: 20,
      },
      {
        sourceMedium: "google / cpc",
        campaign: "spring_sale",
        sessions: 200,
        engagementRate: 0.6,
        keyEvents: 12,
      },
    ]);
  });

  it("derives average engagement per session for landing pages", () => {
    const landingPages: Ga4ReportResponse = {
      dimensionHeaders: dimensionHeaders(["landingPage"]),
      metricHeaders: metricHeaders([
        "sessions",
        "newUsers",
        "userEngagementDuration",
        "keyEvents",
      ]),
      rows: [row("/menu", [40, 10, 2000, 3]), row("/", [0, 0, 0, 0])],
    };
    const dashboard = mapDashboardResponse(reportsWith({ landingPages }));

    expect(dashboard.landingPages).toEqual([
      {
        path: "/menu",
        sessions: 40,
        newUsers: 10,
        avgEngagementSeconds: 50,
        keyEvents: 3,
      },
      {
        path: "/",
        sessions: 0,
        newUsers: 0,
        avgEngagementSeconds: 0,
        keyEvents: 0,
      },
    ]);
  });

  it("fills the heatmap to 7 × 24 cells and ignores junk coordinates", () => {
    const heatmap: Ga4ReportResponse = {
      dimensionHeaders: dimensionHeaders(["dayOfWeek", "hour"]),
      metricHeaders: metricHeaders(["sessions"]),
      rows: [
        row(["1", "09"], [12]),
        row(["0", "23"], [3]),
        row(["9", "99"], [1]),
      ],
    };
    const dashboard = mapDashboardResponse(reportsWith({ heatmap }));

    expect(dashboard.heatmap).toHaveLength(168);
    expect(
      dashboard.heatmap.find((cell) => cell.dayOfWeek === 1 && cell.hour === 9),
    ).toEqual({ dayOfWeek: 1, hour: 9, sessions: 12 });
    expect(
      dashboard.heatmap.find((cell) => cell.dayOfWeek === 0 && cell.hour === 23)
        ?.sessions,
    ).toBe(3);
    expect(
      dashboard.heatmap.reduce((acc, cell) => acc + cell.sessions, 0),
    ).toBe(15);
  });

  it("orders audience segments new → returning and drops zero key events", () => {
    const newVsReturning: Ga4ReportResponse = {
      dimensionHeaders: dimensionHeaders(["newVsReturning"]),
      metricHeaders: metricHeaders([
        "activeUsers",
        "sessions",
        "engagementRate",
      ]),
      rows: [row("returning", [30, 60, 0.7]), row("new", [70, 80, 0.5])],
    };
    const keyEventsByName: Ga4ReportResponse = {
      dimensionHeaders: dimensionHeaders(["eventName"]),
      metricHeaders: metricHeaders(["keyEvents"]),
      rows: [
        row("purchase", [12]),
        row("page_view", [0]),
        row("click_call", [5]),
      ],
    };
    const dashboard = mapDashboardResponse(
      reportsWith({ newVsReturning, keyEventsByName }),
    );

    expect(dashboard.newVsReturning.map((segment) => segment.label)).toEqual([
      "new",
      "returning",
    ]);
    expect(dashboard.keyEventsByName).toEqual([
      { eventName: "purchase", keyEvents: 12 },
      { eventName: "click_call", keyEvents: 5 },
    ]);
  });

  it("tolerates an empty batch", () => {
    const dashboard = mapDashboardResponse([]);

    expect(dashboard.daily).toEqual([]);
    expect(dashboard.totals.sessions).toBe(0);
    expect(dashboard.previousTotals).toBeNull();
    expect(dashboard.heatmap).toHaveLength(168);
  });
});

describe("realtime", () => {
  it("builds three requests over the last 30 minutes", () => {
    const requests = buildRealtimeRequests();

    expect(requests).toHaveLength(3);
    expect(requests[0].dimensions).toBeUndefined();
    expect(requests[1].dimensions).toEqual([{ name: "minutesAgo" }]);
    expect(requests[2].dimensions).toEqual([{ name: "unifiedScreenName" }]);
    for (const request of requests) {
      expect(request.minuteRanges).toEqual([{ startMinutesAgo: 29 }]);
    }
  });

  it("maps the total, fills every minute and ranks pages", () => {
    const fetchedAt = new Date("2026-10-16T10:00:00Z");
    const realtime = mapRealtimeResponse(
      [
        {
          metricHeaders: metricHeaders(["activeUsers"]),
          rows: [row([], [42])],
        },
        {
          dimensionHeaders: dimensionHeaders(["minutesAgo"]),
          metricHeaders: metricHeaders(["activeUsers"]),
          rows: [row("00", [5]), row("07", [3]), row("29", [1])],
        },
        {
          dimensionHeaders: dimensionHeaders(["unifiedScreenName"]),
          metricHeaders: metricHeaders(["activeUsers"]),
          rows: [row("Menu", [4]), row("Home", [9])],
        },
      ],
      fetchedAt,
    );

    expect(realtime.activeUsers).toBe(42);
    expect(realtime.perMinute).toHaveLength(REALTIME_MINUTES);
    expect(realtime.perMinute[0]).toEqual({ minutesAgo: 0, activeUsers: 5 });
    expect(realtime.perMinute[7].activeUsers).toBe(3);
    expect(realtime.perMinute[8].activeUsers).toBe(0);
    expect(realtime.topPages).toEqual([
      { title: "Home", activeUsers: 9 },
      { title: "Menu", activeUsers: 4 },
    ]);
    expect(realtime.fetchedAt).toBe(fetchedAt.toISOString());
  });
});

describe("formatGa4Date", () => {
  it("converts YYYYMMDD and leaves other values alone", () => {
    expect(formatGa4Date("20260131")).toBe("2026-01-31");
    expect(formatGa4Date("(other)")).toBe("(other)");
  });
});
