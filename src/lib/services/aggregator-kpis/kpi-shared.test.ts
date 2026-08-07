import { describe, expect, it } from "vitest";
import type { KpiFilters } from "./aggregator-kpis";
import { parseKpiFilters, storeWhere } from "./kpi-shared.server";

function filters(overrides: Partial<KpiFilters> = {}): KpiFilters {
  return {
    aggregator: null,
    storeId: null,
    brandId: null,
    storeIds: null,
    from: null,
    to: null,
    ...overrides,
  };
}

describe("storeWhere", () => {
  it("is unfiltered when nothing is selected", () => {
    expect(storeWhere(filters())).toEqual({});
  });

  it("filters by a single store", () => {
    expect(storeWhere(filters({ storeId: 5 }))).toEqual({ id: 5 });
  });

  it("filters by the brand's store set", () => {
    expect(storeWhere(filters({ storeIds: [1, 2] }))).toEqual({
      id: { in: [1, 2] },
    });
  });

  it("matches nothing when the brand owns no store", () => {
    expect(storeWhere(filters({ storeIds: [] }))).toEqual({ id: { in: [] } });
  });

  it("intersects a store with the brand's set rather than overwriting", () => {
    // Both scopes target `id`, so spreading them would silently drop one.
    expect(storeWhere(filters({ storeId: 5, storeIds: [5, 6] }))).toEqual({
      id: { in: [5] },
    });
  });

  it("matches nothing when the store is outside the brand", () => {
    expect(storeWhere(filters({ storeId: 5, storeIds: [1, 2] }))).toEqual({
      id: { in: [] },
    });
  });

  it("keeps the aggregator predicate alongside the store scope", () => {
    expect(storeWhere(filters({ aggregator: "WOLT", storeIds: [3] }))).toEqual({
      aggregator: "WOLT",
      id: { in: [3] },
    });
  });
});

describe("parseKpiFilters", () => {
  it("reads brandId alongside the existing filters", () => {
    expect(
      parseKpiFilters(
        new URLSearchParams(
          "aggregator=WOLT&storeId=2&brandId=8&from=2026-01-01&to=2026-01-31",
        ),
      ),
    ).toEqual({
      aggregator: "WOLT",
      storeId: 2,
      brandId: 8,
      storeIds: null,
      from: "2026-01-01",
      to: "2026-01-31",
    });
  });

  it("treats empty and malformed brandId as unset", () => {
    expect(parseKpiFilters(new URLSearchParams("brandId=")).brandId).toBe(null);
    expect(parseKpiFilters(new URLSearchParams("brandId=nope")).brandId).toBe(
      null,
    );
  });
});
