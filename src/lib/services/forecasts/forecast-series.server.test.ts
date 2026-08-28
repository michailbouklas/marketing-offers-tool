import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/clickhouse", () => ({
  clickhouse: { query: vi.fn() },
}));

vi.mock("$lib/server/env", () => ({
  getForecastEnv: vi.fn(),
}));

const { clickhouse } = await import("$lib/server/clickhouse");
const { getForecastEnv } = await import("$lib/server/env");
const series = await import("./forecast-series.server");

const queryMock = vi.mocked(clickhouse.query);
const envMock = vi.mocked(getForecastEnv);

function mockRows(...batches: unknown[][]) {
  for (const rows of batches) {
    queryMock.mockResolvedValueOnce({
      json: async () => rows,
    } as unknown as Awaited<ReturnType<typeof clickhouse.query>>);
  }
}

function lastQuery(callIndex = 0) {
  const call = queryMock.mock.calls[callIndex]?.[0] as {
    query: string;
    query_params: Record<string, unknown>;
    format: string;
  };
  return {
    sql: call.query.replace(/\s+/g, " ").trim(),
    params: call.query_params,
    format: call.format,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  envMock.mockReturnValue({
    FORECAST_SERVICE_URL: "http://localhost:8000",
    FORECAST_SERVICE_TOKEN: undefined,
    FORECAST_TIMEOUT_MS: 75_000,
    FORECAST_HISTORY_DAYS: 1095,
    FORECAST_CACHE_TTL_MS: 21_600_000,
    FORECAST_MODELS_TTL_MS: 600_000,
    FORECAST_DEFAULT_COUNTRY: "CY",
    CLICKHOUSE_SALES_DATABASE: "sales_db",
  });
});

describe("salesTransactionsTable", () => {
  it("qualifies the table with the configured database", () => {
    expect(series.salesTransactionsTable()).toBe("sales_db.transactions");
  });

  it("rejects database names that are not strict identifiers", () => {
    expect(() => series.salesTransactionsTable("bad-db")).toThrow(
      /Invalid CLICKHOUSE_SALES_DATABASE/,
    );
    expect(() => series.salesTransactionsTable("x; DROP TABLE y")).toThrow();
    expect(() => series.salesTransactionsTable("")).toThrow();
  });
});

describe("toNumber", () => {
  it("parses Decimal / UInt64 strings and passes numbers through", () => {
    expect(series.toNumber("12345.67")).toBe(12345.67);
    expect(series.toNumber(" 812 ")).toBe(812);
    expect(series.toNumber(3)).toBe(3);
  });

  it("falls back to 0 for null, empty and garbage", () => {
    expect(series.toNumber(null)).toBe(0);
    expect(series.toNumber(undefined)).toBe(0);
    expect(series.toNumber("")).toBe(0);
    expect(series.toNumber("abc")).toBe(0);
    expect(series.toNumber(Number.NaN)).toBe(0);
  });
});

describe("date helpers", () => {
  it("adds days across month/year boundaries in UTC", () => {
    expect(series.addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(series.addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(series.addDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("computes inclusive history windows ending at the latest date", () => {
    expect(series.computeHistoryWindow("2026-08-25", 1095)).toEqual({
      from: "2023-08-27",
      to: "2026-08-25",
    });
    expect(series.computeHistoryWindow("2026-08-25", 1)).toEqual({
      from: "2026-08-25",
      to: "2026-08-25",
    });
    expect(series.computeHistoryWindow("2026-08-25", 0).from).toBe(
      "2026-08-25",
    );
    expect(
      series.daysBetween(
        series.computeHistoryWindow("2026-08-25", 90).from,
        "2026-08-25",
      ) + 1,
    ).toBe(90);
  });

  it("rejects malformed ISO dates", () => {
    expect(() => series.addDays("2026-8-1", 1)).toThrow(/ISO date/);
  });
});

describe("countMissingDays", () => {
  const window = { from: "2026-08-01", to: "2026-08-10" };

  it("counts gaps after the first observed day only", () => {
    const points = [
      { ds: "2026-08-03" },
      { ds: "2026-08-04" },
      { ds: "2026-08-07" },
      { ds: "2026-08-10" },
    ];

    // 03..10 = 8 expected days, 4 present.
    expect(series.countMissingDays(points, window)).toBe(4);
  });

  it("returns 0 for a complete series and ignores points outside the window", () => {
    const points = Array.from({ length: 10 }, (_, index) => ({
      ds: `2026-08-${String(index + 1).padStart(2, "0")}`,
    }));

    expect(
      series.countMissingDays([...points, { ds: "2026-07-31" }], window),
    ).toBe(0);
  });

  it("counts every day of the window when the series is empty", () => {
    expect(series.countMissingDays([], window)).toBe(10);
  });
});

describe("getLatestSalesDate", () => {
  const now = new Date("2026-08-27T09:00:00Z");

  it("returns the probe result and binds the brand lowercased", async () => {
    mockRows([{ ds: "2026-08-25" }]);

    await expect(series.getLatestSalesDate(" BK ", { now })).resolves.toBe(
      "2026-08-25",
    );

    expect(queryMock).toHaveBeenCalledTimes(1);
    const { sql, params, format } = lastQuery();
    expect(format).toBe("JSONEachRow");
    expect(sql).toContain("FROM sales_db.transactions");
    expect(sql).toContain("tran_date >= {probe_from:Date}");
    expect(sql).toContain("tran_date <= today()");
    expect(sql).toContain("lower(brand) = {brand:String}");
    expect(sql).toContain("tran_sales_factor = 1");
    expect(sql).toContain("ORDER BY tran_date DESC LIMIT 1");
    expect(params).toEqual({ probe_from: "2026-06-28", brand: "bk" });
  });

  it("falls back to the full history lookback when the probe is empty", async () => {
    mockRows([], [{ ds: "2026-03-02" }]);

    await expect(series.getLatestSalesDate("kfc", { now })).resolves.toBe(
      "2026-03-02",
    );

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(lastQuery(1).params).toEqual({
      probe_from: "2023-08-28",
      brand: "kfc",
    });
  });

  it("returns null when both windows are empty", async () => {
    mockRows([], []);

    await expect(series.getLatestSalesDate("kfc", { now })).resolves.toBeNull();
  });

  it("skips the fallback when the lookback is not longer than the probe", async () => {
    mockRows([]);

    await expect(
      series.getLatestSalesDate("kfc", { now, historyDays: 30 }),
    ).resolves.toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

describe("getDailySalesSeries", () => {
  it("aggregates revenue and orders per day and parses Decimal strings", async () => {
    mockRows([
      { ds: "2026-08-01", revenue: "12345.67", orders: "812" },
      { ds: "2026-08-02", revenue: "0", orders: "0" },
      { ds: "2026-08-03", revenue: null, orders: 3 },
    ]);

    const points = await series.getDailySalesSeries({
      brandAlias: "BK",
      from: "2026-08-01",
      to: "2026-08-03",
    });

    expect(points).toEqual([
      { ds: "2026-08-01", revenue: 12345.67, orders: 812 },
      { ds: "2026-08-02", revenue: 0, orders: 0 },
      { ds: "2026-08-03", revenue: 0, orders: 3 },
    ]);

    const { sql, params } = lastQuery();
    expect(sql).toContain(
      "SELECT tran_date AS ds, sum(tran_net) AS revenue, count() AS orders FROM sales_db.transactions",
    );
    expect(sql).toContain("tran_date BETWEEN {from:Date} AND {to:Date}");
    expect(sql).toContain("lower(brand) = {brand:String}");
    expect(sql).toContain("tran_sales_factor = 1");
    expect(sql).toContain("GROUP BY tran_date ORDER BY tran_date");
    expect(params).toEqual({
      from: "2026-08-01",
      to: "2026-08-03",
      brand: "bk",
    });
  });

  it("rejects malformed date bounds before querying", async () => {
    await expect(
      series.getDailySalesSeries({
        brandAlias: "bk",
        from: "yesterday",
        to: "2026-08-03",
      }),
    ).rejects.toThrow(/ISO date/);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("getSalesHistorySummary", () => {
  it("returns the latest date, the count of sales days and the recent points", async () => {
    mockRows(
      [{ ds: "2026-08-05" }],
      [
        { ds: "2026-08-01", revenue: "10", orders: "1" },
        { ds: "2026-08-02", revenue: "20", orders: "2" },
        { ds: "2026-08-05", revenue: "50", orders: "5" },
      ],
    );

    const summary = await series.getSalesHistorySummary("bk", {
      recentDays: 2,
      now: new Date("2026-08-06T00:00:00Z"),
    });

    expect(summary).toEqual({
      latestSalesDate: "2026-08-05",
      historyDays: 3,
      points: [
        { ds: "2026-08-02", revenue: 20, orders: 2 },
        { ds: "2026-08-05", revenue: 50, orders: 5 },
      ],
    });
    expect(lastQuery(1).params).toMatchObject({
      from: "2023-08-07",
      to: "2026-08-05",
    });
  });

  it("returns null when the brand has no sales at all", async () => {
    mockRows([], []);

    await expect(
      series.getSalesHistorySummary("bk", { recentDays: 90 }),
    ).resolves.toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(2);
  });
});

describe("getLocationHistoryCoverage", () => {
  beforeEach(() => {
    series.__clearForecastLocationCoverageCache();
  });

  it("returns one row per location with coerced counts, from a single grouped query", async () => {
    mockRows([
      {
        id: "3",
        name: "Limassol Marina",
        first_ds: "2024-01-05",
        latest_ds: "2026-08-27",
        days_with_sales: "900",
      },
      {
        id: 9,
        name: "",
        first_ds: "2026-06-01",
        latest_ds: "2026-08-27",
        days_with_sales: 80,
      },
    ]);

    const coverage = await series.getLocationHistoryCoverage("BK", {
      now: new Date("2026-08-28T10:00:00Z"),
    });

    expect(coverage).toEqual([
      {
        id: 3,
        name: "Limassol Marina",
        firstSalesDate: "2024-01-05",
        latestSalesDate: "2026-08-27",
        daysWithSales: 900,
      },
      {
        id: 9,
        name: "Location 9",
        firstSalesDate: "2026-06-01",
        latestSalesDate: "2026-08-27",
        daysWithSales: 80,
      },
    ]);
    expect(queryMock).toHaveBeenCalledTimes(1);
    const { sql, params } = lastQuery();
    expect(sql).toContain("uniqExact(tran_date) AS days_with_sales");
    expect(sql).toContain("GROUP BY tran_location");
    expect(sql).toContain("lower(brand) = {brand:String}");
    expect(params).toEqual({ from: "2023-08-29", brand: "bk" });
  });

  it("serves the second call for the same brand from the cache", async () => {
    mockRows([]);
    const now = new Date("2026-08-28T10:00:00Z");

    await series.getLocationHistoryCoverage("bk", { now });
    await series.getLocationHistoryCoverage("bk", { now });

    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});
