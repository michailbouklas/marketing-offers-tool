import { describe, expect, it } from "vitest";
import {
  routeSection,
  summarizeUserUsage,
  type HistoryDay,
  type UserHistory,
} from "./page-views";

function day(
  date: string,
  pageViews: number,
  routes: [string, number, number][],
): HistoryDay {
  return {
    day: date,
    visits: 1,
    pageViews,
    foregroundMs: pageViews * 1000,
    routes: routes.map(([routeId, views, foregroundMs]) => ({
      routeId,
      views,
      foregroundMs,
      totalMs: foregroundMs,
      firstSeenAt: `${date}T08:00:00Z`,
      lastSeenAt: `${date}T09:00:00Z`,
    })),
    viewsByRoute: {},
    hasDetail: false,
  };
}

describe("summarizeUserUsage", () => {
  const history: UserHistory = {
    user: { id: "u1", name: "A", email: "a@x", role: null },
    totals: { visits: 2, pageViews: 5, foregroundMs: 5000 },
    // Newest first, like getUserHistory.
    days: [
      day("2026-11-03", 2, [["/offers", 2, 500]]),
      day("2026-11-01", 3, [
        ["/offers", 1, 100],
        ["/sales", 2, 900],
      ]),
    ],
  };

  const summary = summarizeUserUsage(
    history,
    { from: "2026-10-31", to: "2026-11-03" },
    1,
  );

  it("zero-fills every day of the range, oldest first", () => {
    expect(summary.daily.map((d) => [d.day, d.pageViews])).toEqual([
      ["2026-10-31", 0],
      ["2026-11-01", 3],
      ["2026-11-02", 0],
      ["2026-11-03", 2],
    ]);
  });

  it("sums routes across days and keeps the top N", () => {
    // /offers 3 views beats /sales 2 views.
    expect(summary.topRoutes).toEqual([
      { routeId: "/offers", views: 3, foregroundMs: 600 },
    ]);
  });

  it("reports the newest active day", () => {
    expect(summary.lastActiveDay).toBe("2026-11-03");
  });

  it("groups all routes (not just the top N) into sections with shares", () => {
    expect(summary.sections).toEqual([
      { section: "/offers", views: 3, foregroundMs: 600, share: 0.6 },
      { section: "/sales", views: 2, foregroundMs: 900, share: 0.4 },
    ]);
  });
});

describe("routeSection", () => {
  it("takes the first real segment and skips route groups", () => {
    expect(routeSection("/sales/offers")).toBe("/sales");
    expect(routeSection("/(auth)/login")).toBe("/login");
    expect(routeSection("/")).toBe("/");
    expect(routeSection("")).toBe("");
  });
});
