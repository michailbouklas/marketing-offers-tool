import { describe, expect, it } from "vitest";
import {
  buildSalesDayRows,
  resolveSalesDashboardFilters,
  salesDashboardSearch,
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
    const filters = resolve("brands=kfc&location=12&division=TAWOLT");
    const search = salesDashboardSearch(filters, { allBrands: false });
    expect(resolve(search)).toEqual(filters);
  });
});

describe("buildSalesDayRows", () => {
  it("zero-fills missing days and brands, ignoring unknown brands", () => {
    const rows = buildSalesDayRows(
      [
        { day: "2026-10-01", brand: "bk", net: 10.5, txns: 2 },
        { day: "2026-10-03", brand: "kfc", net: 4, txns: 1 },
        { day: "2026-10-03", brand: "other", net: 99, txns: 9 },
      ],
      ["bk", "kfc"],
      "2026-10-01",
      "2026-10-03",
    );

    expect(rows.map((row) => row.day)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(rows[0].byBrand).toEqual({
      bk: { net: 10.5, txns: 2 },
      kfc: { net: 0, txns: 0 },
    });
    expect(rows[1].byBrand.bk).toEqual({ net: 0, txns: 0 });
    expect(rows[2].byBrand).toEqual({
      bk: { net: 0, txns: 0 },
      kfc: { net: 4, txns: 1 },
    });
  });
});
