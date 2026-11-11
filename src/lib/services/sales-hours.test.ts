import { describe, expect, it } from "vitest";
import {
  buildSalesCalendar,
  buildSalesHoursGrid,
  isDateView,
  weekdayCounts,
} from "./sales-hours";

describe("buildSalesCalendar", () => {
  const calendar = buildSalesCalendar(
    [
      { day: "2026-10-30", net: 400, txns: 20 },
      { day: "2026-11-02", net: 100, txns: 4 },
      { day: "2026-10-01", net: 999, txns: 9 }, // out of range: ignored
    ],
    "2026-10-30",
    "2026-11-02",
  );

  it("stacks one block per month with a Mon-first offset", () => {
    expect(calendar.months.map((m) => [m.key, m.label, m.offset])).toEqual([
      ["2026-10", "October 2026", 3], // 2026-10-01 is a Thursday
      ["2026-11", "November 2026", 6], // 2026-11-01 is a Sunday
    ]);
    expect(calendar.months[0].cells).toHaveLength(31);
    expect(calendar.months[1].cells).toHaveLength(30);
  });

  it("flags out-of-range days and zero-fills missing dates", () => {
    const oct = calendar.months[0].cells;
    expect(oct[0]).toMatchObject({
      date: "2026-10-01",
      inRange: false,
      net: 0,
    });
    expect(oct[30]).toMatchObject({
      date: "2026-10-31",
      inRange: true,
      net: 0,
    });
    expect(calendar.months[1].cells[2]).toMatchObject({ inRange: false });
  });

  it("finds the peak date and scales intensity to it", () => {
    expect(calendar.peak).toEqual({ date: "2026-10-30", net: 400 });
    expect(calendar.months[0].cells[29]).toMatchObject({
      weekday: 5,
      intensity: 1,
      atv: 20,
    });
    expect(calendar.months[1].cells[1]).toMatchObject({ intensity: 0.25 });
  });

  it("only applies the date view when grouped by day", () => {
    expect(isDateView(new URLSearchParams("by=day&view=dates"))).toBe(true);
    expect(isDateView(new URLSearchParams("view=dates"))).toBe(false);
  });
});

describe("weekdayCounts", () => {
  it("counts calendar days per ISO weekday", () => {
    // 2026-11-02 is a Monday; two full weeks.
    expect(weekdayCounts("2026-11-02", "2026-11-15")).toEqual([
      2, 2, 2, 2, 2, 2, 2,
    ]);
    expect(weekdayCounts("2026-11-02", "2026-11-03")).toEqual([
      1, 1, 0, 0, 0, 0, 0,
    ]);
  });
});

describe("buildSalesHoursGrid", () => {
  const cells = [
    { weekday: 1, hour: 13, net: 2000, txns: 100 }, // peak: 1000/day
    { weekday: 1, hour: 9, net: 100, txns: 10 }, // 50/day = 5% of peak, dead
    { weekday: 1, hour: 1, net: 400, txns: 20 }, // after midnight, late night
    { weekday: 2, hour: 13, net: 600, txns: 30 }, // 300/day = 30%, not dead
  ];
  const grid = buildSalesHoursGrid(cells, "2026-11-02", "2026-11-15");

  it("orders hours by business day, starting at 05:00", () => {
    expect(grid.hours).toEqual([9, 13, 1]);
  });

  it("averages per calendar day and finds the peak", () => {
    expect(grid.peak).toEqual({ weekday: 1, hour: 13, avgNet: 1000 });
    expect(grid.rows[0][1]).toMatchObject({
      avgNet: 1000,
      avgTxns: 50,
      atv: 20,
      intensity: 1,
    });
  });

  it("flags dead hours but never closed (zero) hours", () => {
    expect(grid.rows[0][0].dead).toBe(true);
    expect(grid.rows[1][1].dead).toBe(false);
    expect(grid.rows[1][0]).toMatchObject({ avgNet: 0, dead: false }); // Tue 09 closed
    expect(grid.deadCount).toBe(1);
  });

  it("does not flag stray orders (under 1 a day) as dead hours", () => {
    const stray = buildSalesHoursGrid(
      [...cells, { weekday: 3, hour: 6, net: 10, txns: 1 }],
      "2026-11-02",
      "2026-11-15",
    );
    expect(stray.rows[2][0]).toMatchObject({ avgTxns: 0.5, dead: false });
    expect(stray.deadCount).toBe(1);
  });

  it("splits net into dayparts, after-midnight hours into late night", () => {
    const share = Object.fromEntries(grid.dayparts.map((p) => [p.key, p.net]));
    expect(share).toEqual({
      breakfast: 100,
      lunch: 2600,
      afternoon: 0,
      dinner: 0,
      late: 400,
    });
  });

  it("groups by day: whole-day averages per calendar day, closed days zero", () => {
    // Mon: (2000 + 100 + 400) / 2 days; Tue: 600 / 2.
    expect(grid.weekdays[0]).toMatchObject({
      avgNet: 1250,
      avgTxns: 65,
      intensity: 1,
      dead: false,
    });
    expect(grid.weekdays[1]).toMatchObject({ avgNet: 300, intensity: 0.24 });
    expect(grid.weekdays[6]).toMatchObject({ avgNet: 0, atv: null });
    expect(grid.peakDay).toEqual({ weekday: 1, avgNet: 1250 });
    expect(buildSalesHoursGrid([], "2026-11-02", "2026-11-15").peakDay).toBe(
      null,
    );
  });
});
