import { describe, expect, it } from "vitest";
import { Prisma } from "../../../generated/merchant-scrapes-prisma/client";
import {
  allStoresFilters,
  parsePeriodFilters,
  periodScopeSql,
  singleStoreFilters,
  storeIdsFilterSql,
} from "./period-shared.server";

/** Renders a `Prisma.Sql` to its literal text with whitespace collapsed. */
function sqlText(sql: Prisma.Sql): string {
  return sql.strings.join("?").replace(/\s+/g, " ").trim();
}

describe("storeIdsFilterSql", () => {
  it("is empty when there is no brand filter", () => {
    expect(storeIdsFilterSql(null)).toBe(Prisma.empty);
  });

  it("matches zero rows when the brand owns no store here", () => {
    // The dangerous alternative is rendering nothing, which would silently
    // widen the query to every store and show another brand's data.
    expect(sqlText(storeIdsFilterSql([]))).toBe("AND FALSE");
  });

  it("binds store ids as parameters, never inlines them", () => {
    const sql = storeIdsFilterSql([7, 9]);

    expect(sqlText(sql)).toBe('AND "storeId" IN (?,?)');
    expect(sql.values).toEqual([7, 9]);
  });
});

describe("periodScopeSql", () => {
  it("is empty when neither a store nor a brand is selected", () => {
    expect(sqlText(periodScopeSql(allStoresFilters("week")))).toBe("");
  });

  it("ANDs the single-store and brand predicates together", () => {
    const sql = periodScopeSql({
      storeId: 5,
      period: "week",
      brandId: 3,
      storeIds: [5, 6],
    });

    expect(sqlText(sql)).toBe('AND "storeId" = ? AND "storeId" IN (?,?)');
    expect(sql.values).toEqual([5, 5, 6]);
  });

  it("drops the brand scope for a single-store detail view", () => {
    const sql = periodScopeSql(singleStoreFilters(42, "month"));

    expect(sqlText(sql)).toBe('AND "storeId" = ?');
    expect(sql.values).toEqual([42]);
  });
});

describe("parsePeriodFilters", () => {
  it("reads storeId, brandId and period from the URL", () => {
    const filters = parsePeriodFilters(
      new URLSearchParams("storeId=4&brandId=9&period=month"),
    );

    expect(filters).toEqual({
      storeId: 4,
      brandId: 9,
      storeIds: null,
      period: "month",
    });
  });

  it("never resolves storeIds itself — that needs a database round-trip", () => {
    expect(parsePeriodFilters(new URLSearchParams("brandId=9")).storeIds).toBe(
      null,
    );
  });

  it("ignores malformed or empty values per field", () => {
    const filters = parsePeriodFilters(
      new URLSearchParams("storeId=&brandId=abc&period=decade"),
    );

    expect(filters).toEqual({
      storeId: null,
      brandId: null,
      storeIds: null,
      period: "week",
    });
  });

  it("rejects a non-positive brandId", () => {
    expect(parsePeriodFilters(new URLSearchParams("brandId=0")).brandId).toBe(
      null,
    );
    expect(parsePeriodFilters(new URLSearchParams("brandId=-3")).brandId).toBe(
      null,
    );
  });
});
