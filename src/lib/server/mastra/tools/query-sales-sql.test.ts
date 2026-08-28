import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("@clickhouse/client", () => ({
  createClient: vi.fn(() => ({ query: queryMock })),
}));

vi.mock("../env", () => ({
  getSalesClickhouseEnv: vi.fn(() => ({
    url: "http://clickhouse.local:8123",
    username: "reader",
    password: "secret",
    database: "sales",
  })),
}));

const { runReadOnlySalesQuery, validateReadOnlySalesSql } =
  await import("./query-sales-sql");

/**
 * The tool asks ClickHouse for the known brand codes once (cached), then runs
 * the wrapped query. Answer both from the SQL text so the order of the calls
 * does not matter.
 */
function answerQueries(rows: Record<string, unknown>[] = []) {
  queryMock.mockImplementation(async ({ query }: { query: string }) => ({
    json: async () =>
      /SELECT DISTINCT lower\(brand\)/i.test(query)
        ? { data: [{ brand: "bk" }, { brand: "kfc" }, { brand: "phcy" }] }
        : {
            meta: [
              { name: "day", type: "Date" },
              { name: "revenue", type: "Decimal(18, 2)" },
            ],
            data: rows,
          },
  }));
}

function dataQueries() {
  return queryMock.mock.calls
    .map(([arg]) => (arg as { query: string }).query)
    .filter((query) => !/SELECT DISTINCT lower\(brand\)/i.test(query));
}

beforeEach(() => {
  queryMock.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  answerQueries();
});

describe("validateReadOnlySalesSql", () => {
  it("accepts a SELECT and strips a trailing semicolon", () => {
    expect(
      validateReadOnlySalesSql(
        "SELECT sum(tran_net) FROM transactions WHERE tran_date >= '2026-01-01';",
      ),
    ).toEqual({
      ok: true,
      sql: "SELECT sum(tran_net) FROM transactions WHERE tran_date >= '2026-01-01'",
    });
  });

  it("rejects multiple statements and non-SELECT statements", () => {
    expect(validateReadOnlySalesSql("SELECT 1; SELECT 2").ok).toBe(false);
    expect(validateReadOnlySalesSql("DESCRIBE transactions").ok).toBe(false);
    expect(validateReadOnlySalesSql("   ").ok).toBe(false);
  });

  it.each(["INSERT", "ALTER", "DROP", "KILL", "settings", "remote", "url"])(
    "rejects the forbidden keyword %s",
    (keyword) => {
      const result = validateReadOnlySalesSql(
        `SELECT * FROM transactions WHERE x = (${keyword} foo)`,
      );
      expect(result.ok).toBe(false);
    },
  );

  it("rejects ClickHouse metadata schemas", () => {
    expect(validateReadOnlySalesSql("SELECT name FROM system.tables").ok).toBe(
      false,
    );
    expect(
      validateReadOnlySalesSql("SELECT * FROM information_schema.columns").ok,
    ).toBe(false);
  });
});

describe("runReadOnlySalesQuery — brand scope guardrail", () => {
  const goodSql =
    "SELECT tran_date AS day, sum(tran_net) AS revenue FROM transactions " +
    "WHERE tran_date >= toDate('2026-08-01') AND lower(brand) IN ('bk') GROUP BY day";

  it("fails closed when no scope was published", async () => {
    const result = await runReadOnlySalesQuery(goodSql, undefined);

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.error).toMatch(/Brand scope is missing/);
    }
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("refuses a user with no brands", async () => {
    const result = await runReadOnlySalesQuery(goodSql, []);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/no assigned brands/);
    }
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects a literal naming a known brand outside the scope, running no data query", async () => {
    const result = await runReadOnlySalesQuery(
      "SELECT sum(tran_net) FROM transactions WHERE tran_date >= toDate('2026-08-01') " +
        "AND lower(brand) IN ('bk', 'phcy')",
      ["bk"],
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("'phcy'");
      expect(result.error.endsWith("You're not assigned to this brand")).toBe(
        true,
      );
    }
    expect(dataQueries()).toEqual([]);
  });

  it("rejects a query with no allowed-brand literal at all", async () => {
    const result = await runReadOnlySalesQuery(
      "SELECT sum(tran_net) FROM transactions WHERE tran_date >= toDate('2026-08-01')",
      ["bk", "kfc"],
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("lower(brand) IN ('bk', 'kfc')");
    }
    expect(dataQueries()).toEqual([]);
  });

  it("does not run SQL that fails read-only validation", async () => {
    const result = await runReadOnlySalesQuery(
      "INSERT INTO transactions VALUES (1)",
      ["bk"],
    );

    expect(result.ok).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("runs an in-scope query wrapped with the row cap and numifies numeric columns", async () => {
    answerQueries([{ day: "2026-08-01", revenue: "1234.50" }]);

    const result = await runReadOnlySalesQuery(goodSql, ["bk"]);

    expect(result).toEqual({
      ok: true,
      rowCount: 1,
      truncated: false,
      rows: [{ day: "2026-08-01", revenue: 1234.5 }],
    });
    const [wrapped] = dataQueries();
    expect(wrapped).toBe(`SELECT * FROM (${goodSql}) AS agent_query LIMIT 201`);
  });

  it("flags truncation when more than the cap comes back", async () => {
    answerQueries(
      Array.from({ length: 201 }, (_, index) => ({
        day: "2026-08-01",
        revenue: String(index),
      })),
    );

    const result = await runReadOnlySalesQuery(goodSql, ["bk"]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.truncated).toBe(true);
      expect(result.rowCount).toBe(200);
    }
  });
});
