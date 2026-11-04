import { describe, expect, it } from "vitest";
import { buildSalesHoursGrid, weekdayCounts } from "./sales-hours";

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
});
