import { describe, expect, it } from "vitest";
import {
  buildSalesDashboard,
  buildSalesStoreRows,
  resolveSalesDashboardFilters,
  salesDashboardSearch,
  salesPctTone,
  shiftYears,
  startOfWeek,
  withSingleBrand,
} from "./sales-dashboard";

const scope = ["bk", "kfc", "phcy"];

function resolve(search: string) {
  return resolveSalesDashboardFilters(
    new URLSearchParams(search),
    scope,
    "2026-11-01",
  );
}

describe("resolveSalesDashboardFilters", () => {
  it("defaults to every scoped brand and the last 30 days", () => {
    expect(resolve("")).toEqual({
      brands: scope,
      from: "2026-10-03",
      to: "2026-11-01",
      locationId: null,
      divisionGroup: null,
      divisionName: null,
      channels: [],
    });
  });

  it("drops brands outside the user's scope", () => {
    expect(resolve("brands=KFC,wagamama,kfc").brands).toEqual(["kfc"]);
    expect(resolve("brands=wagamama").brands).toEqual(scope);
  });

  it("clamps ranges longer than a year and swaps reversed dates", () => {
    expect(resolve("from=2020-01-01&to=2026-11-01").from).toBe("2025-11-01");
    expect(resolve("from=2026-10-10&to=2026-10-01")).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-10",
    });
  });

  it("ignores malformed dates and location ids", () => {
    expect(resolve("from=2026-02-30&to=2026-11-01").from).toBe("2026-10-03");
    const filters = resolve("from=yesterday&to=2026-13-45&location=1;drop");
    expect(filters).toMatchObject({
      from: "2026-10-03",
      to: "2026-11-01",
      locationId: null,
    });
    expect(resolve("location=12&group=%20Delivery%20").locationId).toBe(12);
    expect(resolve("group=%20Delivery%20").divisionGroup).toBe("Delivery");
  });

  it("round-trips through salesDashboardSearch", () => {
    const filters = resolve(
      "brands=kfc&location=12&division=TAWOLT&channels=Wolt,Dine%20in,Wolt",
    );
    expect(filters.channels).toEqual(["Wolt", "Dine in"]);
    const search = salesDashboardSearch(filters, { allBrands: false });
    expect(resolve(search)).toEqual(filters);
  });
});

describe("withSingleBrand", () => {
  it("keeps only the first brand", () => {
    expect(withSingleBrand(resolve("")).brands).toEqual(["bk"]);
    expect(withSingleBrand(resolve("brands=kfc")).brands).toEqual(["kfc"]);
  });
});

describe("date helpers", () => {
  it("shifts years like ClickHouse addYears, clamping Feb 29", () => {
    expect(shiftYears("2026-11-02", -1)).toBe("2025-11-02");
    expect(shiftYears("2024-02-29", -1)).toBe("2023-02-28");
    expect(shiftYears("2024-02-29", -4)).toBe("2020-02-29");
  });

  it("finds the Monday of the week", () => {
    expect(startOfWeek("2026-11-02")).toBe("2026-11-02"); // Monday
    expect(startOfWeek("2026-11-08")).toBe("2026-11-02"); // Sunday
    expect(startOfWeek("2026-01-01")).toBe("2025-12-29"); // across a year
  });
});

describe("buildSalesDashboard", () => {
  const days = [
    { day: "2026-10-30", net: 100, txns: 10 }, // Fri, outside WTD
    { day: "2026-11-02", net: 200, txns: 10 }, // Mon (to)
    { day: "2025-11-02", net: 100, txns: 5 }, // LY of to
    { day: "2025-10-30", net: 50, txns: 5 },
    { day: "2026-01-05", net: 1000, txns: 100 }, // YTD only
    { day: "2024-11-02", net: 300, txns: 10 }, // 2 years back
  ];
  const dashboard = buildSalesDashboard(days, "2026-10-30", "2026-11-02");

  it("anchors WTD/MTD/YTD on the range end", () => {
    expect(dashboard.compare.wtd.net).toEqual({
      thisYear: 200,
      lastYear: 100,
      pct: 1,
    });
    expect(dashboard.compare.mtd.txns.thisYear).toBe(10);
    expect(dashboard.compare.ytd.net.thisYear).toBe(1300);
    expect(dashboard.compare.wtd.atv).toEqual({
      thisYear: 20,
      lastYear: 20,
      pct: 0,
    });
  });

  it("compares the range with the same dates last year", () => {
    expect(dashboard.range.net).toEqual({
      thisYear: 300,
      lastYear: 150,
      pct: 1,
    });
  });

  it("zero-fills daily rows and maps last year onto this year's dates", () => {
    expect(dashboard.daily.map((day) => day.day)).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(dashboard.daily[1]).toMatchObject({
      net: 0,
      atv: null,
      lyPct: null,
    });
    expect(dashboard.daily[3]).toMatchObject({ lyNet: 100, lyPct: 1 });
  });

  it("groups weeks from Monday", () => {
    expect(dashboard.weekly).toEqual([
      { week: "2026-10-26", net: 100 },
      { week: "2026-11-02", net: 200 },
    ]);
  });

  it("averages only prior years that have sales", () => {
    expect(dashboard.periods[2]).toMatchObject({
      net: 225,
      txns: 10,
      atv: 22.5,
    });
  });

  it("returns no change when last year is zero", () => {
    expect(
      buildSalesDashboard([], "2026-11-01", "2026-11-02").range.net.pct,
    ).toBeNull();
  });
});

describe("buildSalesStoreRows", () => {
  it("sorts by net sales and computes changes, null without LY sales", () => {
    const rows = buildSalesStoreRows([
      { location: "A", store: "a", net: 10, txns: 1, lyNet: 0, lyTxns: 0 },
      { location: "B", store: "b", net: 90, txns: 3, lyNet: 100, lyTxns: 4 },
    ]);
    expect(rows.map((row) => row.store)).toEqual(["b", "a"]);
    expect(rows[0]).toMatchObject({
      atv: 30,
      netPct: -0.1,
      txnsPct: -0.25,
      atvPct: 0.2,
    });
    expect(rows[1]).toMatchObject({ netPct: null, atvPct: null });
  });
});

describe("salesPctTone", () => {
  it("follows the Grafana thresholds", () => {
    expect(salesPctTone(0)).toBe("good");
    expect(salesPctTone(-0.05)).toBe("warn");
    expect(salesPctTone(-0.0501)).toBe("bad");
    expect(salesPctTone(null)).toBe("none");
  });
});
