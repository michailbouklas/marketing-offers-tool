import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultForecastValidationFilters } from "./forecast-validation";

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    forecast_validation_run: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

vi.mock("./forecast-validation.server", () => ({
  fromDbDate: (date: Date) => date.toISOString().slice(0, 10),
}));

const { prisma } = await import("$lib/server/prisma");
const query = await import("./forecast-validation-query.server");

const prismaMock = prisma as unknown as {
  forecast_validation_run: {
    count: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
  };
};

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    batch_id: "batch-1",
    trigger: "cli",
    brand_alias: "bk",
    brand_name: "Burger King",
    model_id: "seasonal_trend",
    model_version: "1",
    engine_version: "0.3.0",
    horizon_days: 7,
    cutoff_date: new Date("2026-10-07T00:00:00.000Z"),
    forecast_from: new Date("2026-10-08T00:00:00.000Z"),
    forecast_to: new Date("2026-10-14T00:00:00.000Z"),
    evaluate_after: new Date("2026-10-14T00:00:00.000Z"),
    status: "evaluated",
    forecast_total: 700,
    forecast_lower80: 630,
    forecast_upper80: 770,
    backtest_wape_pct: 9.5,
    backtest_grade: "high",
    warnings: [{ code: "GAPS_FILLED", message: "3 days filled", details: {} }],
    actual_total: 600,
    actual_days: 6,
    deviation: -100,
    deviation_pct: -16.67,
    wape_pct: 25,
    bias_pct: 16.67,
    coverage80_pct: 71.4,
    quality: "medium",
    evaluated_at: new Date("2026-10-15T04:00:00.000Z"),
    error: null,
    created_at: new Date("2026-10-08T10:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.forecast_validation_run.count.mockResolvedValue(0);
  prismaMock.forecast_validation_run.findMany.mockResolvedValue([]);
  prismaMock.forecast_validation_run.findFirst.mockResolvedValue(null);
  prismaMock.forecast_validation_run.groupBy.mockResolvedValue([]);
});

describe("toRunRow", () => {
  it("maps dates to ISO strings and narrows the quality", () => {
    const row = query.toRunRow(record() as never);
    expect(row).toMatchObject({
      id: 7,
      batchId: "batch-1",
      cutoffDate: "2026-10-07",
      forecastFrom: "2026-10-08",
      forecastTo: "2026-10-14",
      evaluateAfter: "2026-10-14",
      status: "evaluated",
      quality: "medium",
      evaluatedAt: "2026-10-15T04:00:00.000Z",
      createdAt: "2026-10-08T10:00:00.000Z",
    });
    expect(
      query.toRunRow(record({ quality: "weird" }) as never).quality,
    ).toBeNull();
  });

  it("keeps well-formed warnings and the points on the detail", () => {
    const detail = query.toRunDetail({
      ...record({
        warnings: [{ code: "X", message: "y" }, "junk", { code: 1 }],
      }),
      points: [
        {
          id: 1,
          run_id: 7,
          ds: new Date("2026-10-08T00:00:00.000Z"),
          yhat: 100,
          lo80: 90,
          hi80: 110,
          actual: 95,
        },
      ],
    } as never);
    expect(detail.warnings).toEqual([{ code: "X", message: "y", details: {} }]);
    expect(detail.points).toEqual([
      { ds: "2026-10-08", yhat: 100, lo80: 90, hi80: 110, actual: 95 },
    ]);
    expect(detail.engineVersion).toBe("0.3.0");
  });
});

describe("listForecastValidationRuns", () => {
  it("returns an empty page without querying when the scope is empty", async () => {
    const page = await query.listForecastValidationRuns({
      brandAliases: [],
      filters: defaultForecastValidationFilters,
    });
    expect(page).toEqual({
      items: [],
      page: 1,
      pageSize: 25,
      totalItems: 0,
      totalPages: 1,
    });
    expect(prismaMock.forecast_validation_run.findMany).not.toHaveBeenCalled();
  });

  it("scopes to the brands, applies the filters and sorts with nulls last", async () => {
    prismaMock.forecast_validation_run.count.mockResolvedValue(51);
    prismaMock.forecast_validation_run.findMany.mockResolvedValue([record()]);

    const page = await query.listForecastValidationRuns({
      brandAliases: ["bk", "kfc"],
      filters: {
        ...defaultForecastValidationFilters,
        brand: "bk",
        model: "blend",
        horizon: 7,
        status: "evaluated",
        quality: "low",
        batch: "batch-1",
        sort: "wape",
        dir: "asc",
        page: 3,
      },
    });

    expect(page.totalItems).toBe(51);
    expect(page.totalPages).toBe(3);
    expect(page.page).toBe(3);
    expect(page.items[0].brandAlias).toBe("bk");

    const call = prismaMock.forecast_validation_run.findMany.mock.calls[0][0];
    expect(call.where).toEqual({
      AND: [
        { brand_alias: { in: ["bk", "kfc"] } },
        { brand_alias: { equals: "bk", mode: "insensitive" } },
        { model_id: "blend" },
        { horizon_days: 7 },
        { status: "evaluated" },
        { quality: "low" },
        { batch_id: "batch-1" },
      ],
    });
    expect(call.orderBy).toEqual([
      { wape_pct: { sort: "asc", nulls: "last" } },
      { id: "desc" },
    ]);
    expect(call.skip).toBe(50);
    expect(call.take).toBe(25);
  });

  it("sorts by cutoff date and id by default", async () => {
    await query.listForecastValidationRuns({
      brandAliases: ["bk"],
      filters: defaultForecastValidationFilters,
    });
    const call = prismaMock.forecast_validation_run.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual([{ cutoff_date: "desc" }, { id: "desc" }]);
  });
});

describe("listForecastValidationMetricRows", () => {
  it("selects only the metric columns and maps them", async () => {
    prismaMock.forecast_validation_run.findMany.mockResolvedValue([
      {
        status: "pending",
        quality: null,
        wape_pct: null,
        deviation_pct: null,
        bias_pct: null,
        coverage80_pct: null,
        evaluate_after: new Date("2026-10-14T00:00:00.000Z"),
        cutoff_date: new Date("2026-10-07T00:00:00.000Z"),
        brand_alias: "bk",
        brand_name: "Burger King",
        model_id: "blend",
        horizon_days: 7,
        batch_id: "batch-1",
      },
    ]);

    const rows = await query.listForecastValidationMetricRows({
      brandAliases: ["bk"],
      filters: defaultForecastValidationFilters,
    });

    expect(rows).toEqual([
      {
        status: "pending",
        quality: null,
        wapePct: null,
        deviationPct: null,
        biasPct: null,
        coverage80Pct: null,
        evaluateAfter: "2026-10-14",
        cutoffDate: "2026-10-07",
        brandAlias: "bk",
        brandName: "Burger King",
        modelId: "blend",
        horizonDays: 7,
        batchId: "batch-1",
      },
    ]);
    const call = prismaMock.forecast_validation_run.findMany.mock.calls[0][0];
    expect(call.take).toBe(query.FORECAST_VALIDATION_METRIC_ROW_CAP);
    expect(call.select.points).toBeUndefined();
  });
});

describe("getForecastValidationRun", () => {
  it("returns null for bad ids or an empty scope without querying", async () => {
    expect(
      await query.getForecastValidationRun(0, { brandAliases: ["bk"] }),
    ).toBeNull();
    expect(
      await query.getForecastValidationRun(Number.NaN, {
        brandAliases: ["bk"],
      }),
    ).toBeNull();
    expect(
      await query.getForecastValidationRun(7, { brandAliases: [] }),
    ).toBeNull();
    expect(prismaMock.forecast_validation_run.findFirst).not.toHaveBeenCalled();
  });

  it("looks the run up inside the scope only", async () => {
    prismaMock.forecast_validation_run.findFirst.mockResolvedValue({
      ...record(),
      points: [],
    });

    const run = await query.getForecastValidationRun(7, {
      brandAliases: ["bk"],
    });

    expect(run?.id).toBe(7);
    expect(prismaMock.forecast_validation_run.findFirst).toHaveBeenCalledWith({
      where: { id: 7, brand_alias: { in: ["bk"] } },
      include: { points: { orderBy: { ds: "asc" } } },
    });
  });
});

describe("listForecastValidationFacets", () => {
  it("collapses renamed brands and shapes the batches", async () => {
    prismaMock.forecast_validation_run.groupBy
      .mockResolvedValueOnce([
        { brand_alias: "bk", brand_name: "Burger King" },
        { brand_alias: "bk", brand_name: "BK (old)" },
        { brand_alias: "kfc", brand_name: "KFC" },
      ])
      .mockResolvedValueOnce([{ model_id: "blend" }])
      .mockResolvedValueOnce([{ horizon_days: 7 }, { horizon_days: 14 }])
      .mockResolvedValueOnce([
        {
          batch_id: "batch-2",
          _count: { _all: 60 },
          _max: {
            cutoff_date: new Date("2026-10-13T00:00:00.000Z"),
            created_at: new Date("2026-10-14T06:00:00.000Z"),
          },
        },
      ]);

    const facets = await query.listForecastValidationFacets({
      brandAliases: ["bk", "kfc"],
    });

    expect(facets.brands).toEqual([
      { alias: "bk", name: "BK (old)" },
      { alias: "kfc", name: "KFC" },
    ]);
    expect(facets.modelIds).toEqual(["blend"]);
    expect(facets.horizons).toEqual([7, 14]);
    expect(facets.batches).toEqual([
      {
        batchId: "batch-2",
        cutoffDate: "2026-10-13",
        createdAt: "2026-10-14T06:00:00.000Z",
        runs: 60,
      },
    ]);
  });
});
