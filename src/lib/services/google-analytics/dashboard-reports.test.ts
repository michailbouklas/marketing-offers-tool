import { describe, expect, it } from "vitest";
import {
  buildDashboardRequests,
  formatGa4Date,
  mapDashboardResponse,
  TOTALS_METRICS,
} from "./dashboard-reports";
import type { Ga4ReportResponse } from "./ga4-client.server";

function metricHeaders(names: readonly string[]) {
  return names.map((name) => ({ name, type: "TYPE_INTEGER" }));
}

function row(dimension: string, metrics: (number | string)[]) {
  return {
    dimensionValues: [{ value: dimension }],
    metricValues: metrics.map((value) => ({ value: String(value) })),
  };
}

const dailyReport: Ga4ReportResponse = {
  dimensionHeaders: [{ name: "date" }],
  metricHeaders: metricHeaders(TOTALS_METRICS),
  // Deliberately out of order to prove the mapper sorts by day.
  rows: [
    row("20261015", [120, 40, 150, 0.6, 100, 5, 400]),
    row("20261014", [100, 30, 130, 0.5, 80, 3, 300]),
  ],
  totals: [
    {
      dimensionValues: [{ value: "RESERVED_TOTAL" }],
      metricValues: [200, 70, 280, 0.55, 90, 8, 700].map((value) => ({
        value: String(value),
      })),
    },
  ],
  rowCount: 2,
};

const channelsReport: Ga4ReportResponse = {
  dimensionHeaders: [{ name: "sessionDefaultChannelGroup" }],
  metricHeaders: metricHeaders(["sessions", "activeUsers"]),
  rows: [row("Organic Search", [180, 120]), row("", [100, 80])],
};

describe("buildDashboardRequests", () => {
  it("builds five reports ending yesterday with totals on the daily one", () => {
    const requests = buildDashboardRequests("28d");

    expect(requests).toHaveLength(5);
    expect(requests[0].dimensions).toEqual([{ name: "date" }]);
    expect(requests[0].metricAggregations).toEqual(["TOTAL"]);
    expect(requests[0].dateRanges).toEqual([
      { startDate: "28daysAgo", endDate: "yesterday" },
    ]);
    expect(
      requests.slice(1).map((request) => request.dimensions?.[0].name),
    ).toEqual([
      "sessionDefaultChannelGroup",
      "pagePath",
      "deviceCategory",
      "country",
    ]);
    for (const request of requests.slice(1)) {
      expect(request.limit).toBe(10);
      expect(request.orderBys).toEqual([
        { metric: { metricName: "sessions" }, desc: true },
      ]);
    }
  });

  it("maps the range presets to GA4 relative dates", () => {
    expect(buildDashboardRequests("7d")[0].dateRanges[0].startDate).toBe(
      "7daysAgo",
    );
    expect(buildDashboardRequests("90d")[0].dateRanges[0].startDate).toBe(
      "90daysAgo",
    );
  });
});

describe("mapDashboardResponse", () => {
  it("prefers the TOTAL aggregation row for the tiles", () => {
    const dashboard = mapDashboardResponse([dailyReport, channelsReport]);

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

  it("sorts the daily series and formats GA4 dates as ISO", () => {
    const dashboard = mapDashboardResponse([dailyReport]);

    expect(dashboard.daily).toEqual([
      { day: "2026-10-14", activeUsers: 100, sessions: 130 },
      { day: "2026-10-15", activeUsers: 120, sessions: 150 },
    ]);
  });

  it("falls back to session-weighted totals when the aggregation row is missing", () => {
    const { totals: _ignored, ...withoutTotals } = dailyReport;
    const dashboard = mapDashboardResponse([withoutTotals]);

    expect(dashboard.totals.sessions).toBe(280);
    expect(dashboard.totals.newUsers).toBe(70);
    // (0.6*150 + 0.5*130) / 280
    expect(dashboard.totals.engagementRate).toBeCloseTo(0.5536, 3);
    // (100*150 + 80*130) / 280
    expect(dashboard.totals.averageSessionDurationSeconds).toBeCloseTo(
      90.71,
      1,
    );
  });

  it("maps breakdowns and labels empty dimension values", () => {
    const dashboard = mapDashboardResponse([dailyReport, channelsReport]);

    expect(dashboard.channels).toEqual([
      { label: "Organic Search", sessions: 180, activeUsers: 120 },
      { label: "(not set)", sessions: 100, activeUsers: 80 },
    ]);
    expect(dashboard.pages).toEqual([]);
    expect(dashboard.devices).toEqual([]);
    expect(dashboard.countries).toEqual([]);
  });

  it("tolerates an empty batch", () => {
    const dashboard = mapDashboardResponse([]);

    expect(dashboard.daily).toEqual([]);
    expect(dashboard.totals.sessions).toBe(0);
  });
});

describe("formatGa4Date", () => {
  it("converts YYYYMMDD and leaves other values alone", () => {
    expect(formatGa4Date("20260131")).toBe("2026-01-31");
    expect(formatGa4Date("(other)")).toBe("(other)");
  });
});
