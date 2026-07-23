import { describe, expect, it } from "vitest";
import {
  runReadOnlyDataQualityQuery,
  validateReadOnlySql,
} from "./query-data-quality-sql";

describe("validateReadOnlySql (data-quality Postgres)", () => {
  it("accepts a plain SELECT", () => {
    const result = validateReadOnlySql(
      "SELECT status, count(*) FROM dq_missing_offers_pricing GROUP BY status",
    );

    expect(result.ok).toBe(true);
  });

  it("accepts a WITH ... SELECT (CTE)", () => {
    const result = validateReadOnlySql(
      "WITH t AS (SELECT 1 AS n) SELECT n FROM t",
    );

    expect(result.ok).toBe(true);
  });

  it("strips a single trailing semicolon", () => {
    const result = validateReadOnlySql("SELECT 1;");

    expect(result).toEqual({ ok: true, sql: "SELECT 1" });
  });

  it("rejects an empty statement", () => {
    expect(validateReadOnlySql("   ").ok).toBe(false);
  });

  it("rejects multiple statements", () => {
    const result = validateReadOnlySql("SELECT 1; SELECT 2");

    expect(result.ok).toBe(false);
  });

  it("rejects non-SELECT statements", () => {
    expect(validateReadOnlySql("EXPLAIN SELECT 1").ok).toBe(false);
  });

  it.each(["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE"])(
    "rejects the forbidden verb %s",
    (verb) => {
      const result = validateReadOnlySql(
        `SELECT * FROM dim_offers_staging WHERE x = (${verb} foo)`,
      );

      expect(result.ok).toBe(false);
    },
  );
});

describe("runReadOnlyDataQualityQuery", () => {
  it("returns a validation error for a write without touching the database", async () => {
    const result = await runReadOnlyDataQualityQuery(
      "DELETE FROM dq_missing_offers_pricing",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/read-only|SELECT/i);
    }
  });
});
