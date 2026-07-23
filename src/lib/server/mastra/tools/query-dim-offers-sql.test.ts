import { describe, expect, it } from "vitest";
import {
  runReadOnlyDimOffersQuery,
  validateReadOnlySql,
} from "./query-dim-offers-sql";

describe("validateReadOnlySql (dim-offers ClickHouse)", () => {
  it("accepts a plain SELECT on dim_offers", () => {
    const result = validateReadOnlySql(
      "SELECT count() FROM dim_offers WHERE ideal_price = 0",
    );

    expect(result.ok).toBe(true);
  });

  it("accepts the qualified apidata_replica.dim_items join", () => {
    const result = validateReadOnlySql(
      "SELECT di.item_code FROM apidata_replica.dim_items AS di WHERE di.item_active = 1",
    );

    expect(result.ok).toBe(true);
  });

  it("rejects multiple statements", () => {
    expect(validateReadOnlySql("SELECT 1; SELECT 2").ok).toBe(false);
  });

  it("rejects non-SELECT statements", () => {
    expect(validateReadOnlySql("DESCRIBE dim_offers").ok).toBe(false);
  });

  it.each(["INSERT", "ALTER", "DROP", "SYSTEM", "settings"])(
    "rejects the forbidden keyword %s",
    (keyword) => {
      const result = validateReadOnlySql(
        `SELECT * FROM dim_offers WHERE x = (${keyword} foo)`,
      );

      expect(result.ok).toBe(false);
    },
  );

  it.each(["system.tables", "information_schema.columns"])(
    "rejects the metadata schema reference %s",
    (ref) => {
      const result = validateReadOnlySql(`SELECT * FROM ${ref}`);

      expect(result.ok).toBe(false);
    },
  );
});

describe("runReadOnlyDimOffersQuery", () => {
  it("returns a validation error for a write without touching the database", async () => {
    const result = await runReadOnlyDimOffersQuery(
      "ALTER TABLE dim_offers UPDATE ideal_price = 0 WHERE 1",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/read-only|SELECT|Forbidden/i);
    }
  });
});
