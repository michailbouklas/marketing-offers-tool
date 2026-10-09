import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ForecastResult } from "./forecast-types";

vi.mock("$lib/server/env", () => ({
  getForecastValidationEnv: vi.fn(),
}));

vi.mock("$lib/server/pg-advisory-lock", () => ({
  tryAcquireAdvisoryLock: vi.fn(),
}));

const tx = {
  forecast_validation_run: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  forecast_validation_point: {
    createMany: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    forecast_validation_run: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("$lib/services/brands.server", () => ({
  listBrands: vi.fn(),
}));

vi.mock("./forecast-engine.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./forecast-engine.server")>()),
  listForecastModels: vi.fn(),
}));

vi.mock("./forecast-run.server", () => ({
  getForecastForBrand: vi.fn(),
}));

vi.mock("./forecast-series.server", () => ({
  getLatestSalesDate: vi.fn(),
  getDailySalesSeries: vi.fn(),
}));

const { getForecastValidationEnv } = await import("$lib/server/env");
const { tryAcquireAdvisoryLock } = await import("$lib/server/pg-advisory-lock");
const { prisma } = await import("$lib/server/prisma");
const { listBrands } = await import("$lib/services/brands.server");
const engine = await import("./forecast-engine.server");
const runModule = await import("./forecast-run.server");
const seriesModule = await import("./forecast-series.server");
const validation = await import("./forecast-validation.server");

const envMock = vi.mocked(getForecastValidationEnv);
const lockMock = vi.mocked(tryAcquireAdvisoryLock);
const listBrandsMock = vi.mocked(listBrands);
const listModelsMock = vi.mocked(engine.listForecastModels);
const forecastMock = vi.mocked(runModule.getForecastForBrand);
const latestMock = vi.mocked(seriesModule.getLatestSalesDate);
const seriesMock = vi.mocked(seriesModule.getDailySalesSeries);
const prismaMock = prisma as unknown as {
  forecast_validation_run: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

const NOW = new Date("2026-10-15T04:00:00.000Z");

const catalog = [
  {
    id: "seasonal_trend",
    name: "Seasonal Trend",
    description: "",
    version: "1",
    minHistoryDays: 56,
    recommendedHorizons: [30],
    supportsHolidays: true,
  },
  {
    id: "calendar_boost",
    name: "Calendar Boost",
    description: "",
    version: "2",
    minHistoryDays: 56,
    recommendedHorizons: [30],
    supportsHolidays: true,
  },
];

const brands = [
  { id: 1, name: "Burger King", alias: "bk", slug: "bk", active: true },
  { id: 2, name: "No Alias", alias: "  ", slug: "na", active: true },
];

function makeResult(overrides: Partial<ForecastResult> = {}): ForecastResult {
  return {
    modelId: "seasonal_trend",
    modelName: "Seasonal Trend",
    modelVersion: "1",
    engineVersion: "0.3.0",
    horizonDays: 7,
    cutoffDate: "2026-10-07",
    history: [],
    forecast: Array.from({ length: 7 }, (_, index) => ({
      ds: `2026-10-${String(8 + index).padStart(2, "0")}`,
      yhat: 100,
      lo80: 90,
      hi80: 110,
      lo95: 80,
      hi95: 120,
    })),
    summary: {
      horizonTotal: 700,
      horizonLower80: 630,
      horizonUpper80: 770,
      samePeriodLastYear: null,
      vsLastYearPct: null,
      trailingPeriodTotal: 690,
      vsTrailingPct: 1.4,
      averageDaily: 100,
      peakDay: "2026-10-10",
      peakDayValue: 100,
      lowDay: "2026-10-08",
      lowDayValue: 100,
      averageOrderValue: null,
    },
    accuracy: {
      holdoutDays: 7,
      folds: 1,
      wapePct: 9.5,
      mapePct: null,
      mae: 10,
      biasPct: 1,
      coverage80Pct: 80,
      grade: "high",
      gradeLabel: "High confidence",
    },
    trendDirection: "flat",
    trendPctPer30d: 0,
    seasonality: {
      strongestWeekday: null,
      weakestWeekday: null,
      weekdayUpliftPct: null,
      yearlySeasonalityUsed: false,
      holidaysUsed: false,
      upcomingHolidays: [],
      notes: [],
    },
    warnings: [{ code: "GAPS_FILLED", message: "3 days filled", details: {} }],
    runtimeMs: 1200,
    generatedAt: NOW.toISOString(),
    brandAlias: "bk",
    brandName: "Burger King",
    cached: false,
    missingDays: 3,
    locationId: null,
    locationName: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  envMock.mockReturnValue({
    FORECAST_VALIDATION_ENABLED: true,
    FORECAST_VALIDATION_CRON: "0 6 * * *",
    FORECAST_VALIDATION_TIMEZONE: "Europe/Nicosia",
    FORECAST_VALIDATION_DEFAULT_DAYS: 7,
    FORECAST_VALIDATION_MAX_LAG_DAYS: 14,
    FORECAST_VALIDATION_CONCURRENCY: 2,
  });
  lockMock.mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) });
  listBrandsMock.mockResolvedValue(brands);
  listModelsMock.mockResolvedValue(catalog);
  prismaMock.forecast_validation_run.findUnique.mockResolvedValue(null);
  prismaMock.forecast_validation_run.findMany.mockResolvedValue([]);
  prismaMock.$transaction.mockImplementation(
    async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  );
  tx.forecast_validation_run.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: 42,
      ...data,
    }),
  );
});

describe("recordForecastValidationRuns", () => {
  it("records one pending run with points per brand x model", async () => {
    forecastMock.mockImplementation(async (input) =>
      makeResult({ modelId: input.modelId }),
    );

    const result = await validation.recordForecastValidationRuns({
      horizonDays: 7,
      trigger: "cli",
      now: NOW,
    });

    expect(result.status).toBe("ran");
    if (result.status !== "ran") return;

    // The alias-less brand is dropped; two models for "bk".
    expect(result.summary.brands).toEqual(["bk"]);
    expect(result.summary.models).toEqual(["seasonal_trend", "calendar_boost"]);
    expect(result.summary.recorded).toBe(2);
    expect(forecastMock).toHaveBeenCalledTimes(2);
    expect(forecastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        brandAlias: "bk",
        brandName: "Burger King",
        modelId: "seasonal_trend",
        horizonDays: 7,
      }),
      { now: NOW.getTime() },
    );

    expect(tx.forecast_validation_run.create).toHaveBeenCalledTimes(2);
    const created = tx.forecast_validation_run.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      brand_alias: "bk",
      model_id: "seasonal_trend",
      horizon_days: 7,
      status: "pending",
      forecast_total: 700,
      backtest_wape_pct: 9.5,
      backtest_grade: "high",
      cutoff_date: new Date("2026-10-07T00:00:00.000Z"),
      forecast_from: new Date("2026-10-08T00:00:00.000Z"),
      forecast_to: new Date("2026-10-14T00:00:00.000Z"),
      evaluate_after: new Date("2026-10-14T00:00:00.000Z"),
    });
    expect(created.batch_id).toBe(result.summary.batchId);

    expect(tx.forecast_validation_point.createMany).toHaveBeenCalledTimes(2);
    const points =
      tx.forecast_validation_point.createMany.mock.calls[0][0].data;
    expect(points).toHaveLength(7);
    expect(points[0]).toEqual({
      run_id: 42,
      ds: new Date("2026-10-08T00:00:00.000Z"),
      yhat: 100,
      lo80: 90,
      hi80: 110,
    });
  });

  it("stores INSUFFICIENT_HISTORY as a skipped marker and keeps going", async () => {
    forecastMock.mockImplementation(async (input) => {
      if (input.modelId === "calendar_boost") {
        throw new engine.ForecastError(
          "INSUFFICIENT_HISTORY",
          "bk has 10 days of sales history; Calendar Boost needs at least 56.",
        );
      }
      return makeResult();
    });

    const result = await validation.recordForecastValidationRuns({
      horizonDays: 7,
      trigger: "cli",
      now: NOW,
    });

    expect(result.status).toBe("ran");
    if (result.status !== "ran") return;
    expect(result.summary.recorded).toBe(1);
    expect(result.summary.skipped).toBe(1);
    expect(result.summary.failed).toBe(0);

    expect(prismaMock.forecast_validation_run.create).toHaveBeenCalledTimes(1);
    expect(
      prismaMock.forecast_validation_run.create.mock.calls[0][0].data,
    ).toMatchObject({
      model_id: "calendar_boost",
      status: "skipped",
      error: expect.stringContaining("INSUFFICIENT_HISTORY"),
      cutoff_date: new Date("2026-10-15T00:00:00.000Z"),
      forecast_total: 0,
    });
  });

  it("stores other engine errors as failed markers", async () => {
    forecastMock.mockRejectedValue(
      new engine.ForecastError("ENGINE_UNAVAILABLE", "connection refused"),
    );

    const result = await validation.recordForecastValidationRuns({
      horizonDays: 7,
      modelIds: ["seasonal_trend"],
      trigger: "cli",
      now: NOW,
    });

    expect(result.status).toBe("ran");
    if (result.status !== "ran") return;
    expect(result.summary.failed).toBe(1);
    expect(result.summary.outcomes[0]).toMatchObject({
      status: "failed",
      error: "ENGINE_UNAVAILABLE: connection refused",
    });
    expect(
      prismaMock.forecast_validation_run.create.mock.calls[0][0].data,
    ).toMatchObject({ status: "failed" });
  });

  it("counts an existing pending run for the same cutoff as a duplicate", async () => {
    forecastMock.mockResolvedValue(makeResult());
    prismaMock.forecast_validation_run.findUnique.mockResolvedValue({
      id: 7,
      status: "pending",
    });

    const result = await validation.recordForecastValidationRuns({
      horizonDays: 7,
      modelIds: ["seasonal_trend"],
      trigger: "cli",
      now: NOW,
    });

    expect(result.status).toBe("ran");
    if (result.status !== "ran") return;
    expect(result.summary.duplicates).toBe(1);
    expect(result.summary.recorded).toBe(0);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("replaces an earlier skipped marker with the same cutoff", async () => {
    forecastMock.mockResolvedValue(makeResult());
    prismaMock.forecast_validation_run.findUnique.mockResolvedValue({
      id: 7,
      status: "skipped",
    });

    const result = await validation.recordForecastValidationRuns({
      horizonDays: 7,
      modelIds: ["seasonal_trend"],
      trigger: "cli",
      now: NOW,
    });

    expect(result.status).toBe("ran");
    if (result.status !== "ran") return;
    expect(result.summary.recorded).toBe(1);
    expect(tx.forecast_validation_run.delete).toHaveBeenCalledWith({
      where: { id: 7 },
    });
    expect(tx.forecast_validation_run.create).toHaveBeenCalledTimes(1);
  });

  it("writes nothing in dry-run mode", async () => {
    forecastMock.mockResolvedValue(makeResult());

    const result = await validation.recordForecastValidationRuns({
      horizonDays: 7,
      modelIds: ["seasonal_trend"],
      trigger: "cli",
      dryRun: true,
      now: NOW,
    });

    expect(result.status).toBe("ran");
    if (result.status !== "ran") return;
    expect(result.summary.dryRun).toBe(true);
    expect(result.summary.recorded).toBe(1);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.forecast_validation_run.create).not.toHaveBeenCalled();
  });

  it("rejects unknown brands, models and horizons before taking the lock", async () => {
    await expect(
      validation.recordForecastValidationRuns({
        horizonDays: 7,
        brandAliases: ["nope"],
        trigger: "cli",
      }),
    ).rejects.toBeInstanceOf(validation.ForecastValidationInputError);

    await expect(
      validation.recordForecastValidationRuns({
        horizonDays: 7,
        modelIds: ["nope"],
        trigger: "cli",
      }),
    ).rejects.toThrow(/Unknown forecast model/);

    await expect(
      validation.recordForecastValidationRuns({
        horizonDays: 91,
        trigger: "cli",
      }),
    ).rejects.toThrow(/between 1 and 90/);

    expect(lockMock).not.toHaveBeenCalled();
  });

  it("matches --brand aliases case-insensitively", async () => {
    forecastMock.mockResolvedValue(makeResult());

    const result = await validation.recordForecastValidationRuns({
      horizonDays: 7,
      brandAliases: ["BK"],
      modelIds: ["seasonal_trend"],
      trigger: "cli",
      now: NOW,
    });

    expect(result.status).toBe("ran");
    if (result.status !== "ran") return;
    expect(result.summary.brands).toEqual(["bk"]);
  });

  it("skips when another process holds the lock", async () => {
    lockMock.mockResolvedValue(null);

    const result = await validation.recordForecastValidationRuns({
      horizonDays: 7,
      trigger: "cli",
    });

    expect(result).toEqual({
      status: "skipped",
      reason: expect.stringContaining("already recording"),
    });
    expect(forecastMock).not.toHaveBeenCalled();
  });
});

describe("evaluateDueForecastValidationRuns", () => {
  function dueRun(overrides: Record<string, unknown> = {}) {
    return {
      id: 7,
      brand_alias: "bk",
      model_id: "seasonal_trend",
      status: "pending",
      forecast_from: new Date("2026-10-08T00:00:00.000Z"),
      forecast_to: new Date("2026-10-14T00:00:00.000Z"),
      evaluate_after: new Date("2026-10-14T00:00:00.000Z"),
      forecast_total: 700,
      points: Array.from({ length: 7 }, (_, index) => ({
        id: 100 + index,
        run_id: 7,
        ds: new Date(
          `2026-10-${String(8 + index).padStart(2, "0")}T00:00:00.000Z`,
        ),
        yhat: 100,
        lo80: 90,
        hi80: 110,
        actual: null,
      })),
      ...overrides,
    };
  }

  it("leaves a run pending while the warehouse lags behind the window", async () => {
    prismaMock.forecast_validation_run.findMany.mockResolvedValue([dueRun()]);
    latestMock.mockResolvedValue("2026-10-13");

    const result = await validation.evaluateDueForecastValidationRuns({
      trigger: "cron",
      now: NOW,
    });

    expect(result.status).toBe("ran");
    if (result.status !== "ran") return;
    expect(result.summary).toMatchObject({
      due: 1,
      evaluated: 0,
      waiting: 1,
      failed: 0,
    });
    expect(result.summary.outcomes[0]).toMatchObject({
      runId: 7,
      status: "waiting",
      reason: expect.stringContaining("need 2026-10-14"),
    });
    expect(seriesMock).not.toHaveBeenCalled();
    expect(prismaMock.forecast_validation_run.update).not.toHaveBeenCalled();
  });

  it("marks a run failed once the lag exceeds FORECAST_VALIDATION_MAX_LAG_DAYS", async () => {
    prismaMock.forecast_validation_run.findMany.mockResolvedValue([dueRun()]);
    latestMock.mockResolvedValue("2026-10-13");
    const later = new Date("2026-10-29T04:00:00.000Z"); // 15 days after forecast_to

    const result = await validation.evaluateDueForecastValidationRuns({
      trigger: "cron",
      now: later,
    });

    expect(result.status).toBe("ran");
    if (result.status !== "ran") return;
    expect(result.summary.failed).toBe(1);
    expect(prismaMock.forecast_validation_run.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        status: "failed",
        error: expect.stringContaining("ACTUALS_UNAVAILABLE"),
        evaluated_at: later,
      },
    });
  });

  it("evaluates a run once actuals are complete and writes quality + points", async () => {
    prismaMock.forecast_validation_run.findMany.mockResolvedValue([dueRun()]);
    latestMock.mockResolvedValue("2026-10-14");
    seriesMock.mockResolvedValue([
      { ds: "2026-10-08", revenue: 110, orders: 10 },
      { ds: "2026-10-09", revenue: 95, orders: 10 },
      { ds: "2026-10-10", revenue: 80, orders: 10 },
      { ds: "2026-10-11", revenue: 115, orders: 10 },
      { ds: "2026-10-12", revenue: 100, orders: 10 },
      { ds: "2026-10-13", revenue: 100, orders: 10 },
      // 2026-10-14 missing: counts as 0
    ]);

    const result = await validation.evaluateDueForecastValidationRuns({
      trigger: "cli",
      now: NOW,
    });

    expect(result.status).toBe("ran");
    if (result.status !== "ran") return;
    expect(result.summary).toMatchObject({ due: 1, evaluated: 1, waiting: 0 });
    expect(seriesMock).toHaveBeenCalledWith({
      brandAlias: "bk",
      from: "2026-10-08",
      to: "2026-10-14",
    });

    // Σ|err| = 10+5+20+15+0+0+100 = 150 over Σ|y| = 600 → 25 % → medium
    expect(tx.forecast_validation_run.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: expect.objectContaining({
        status: "evaluated",
        actual_total: 600,
        actual_days: 6,
        deviation: -100,
        deviation_pct: -16.67,
        wape_pct: 25,
        quality: "medium",
        evaluated_at: NOW,
        error: null,
      }),
    });
    expect(tx.forecast_validation_point.update).toHaveBeenCalledTimes(7);
    expect(tx.forecast_validation_point.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { actual: 110 },
    });
    expect(tx.forecast_validation_point.update).toHaveBeenCalledWith({
      where: { id: 106 },
      data: { actual: 0 },
    });
    expect(result.summary.outcomes[0]).toMatchObject({
      status: "evaluated",
      quality: "medium",
      wapePct: 25,
    });
  });

  it("fetches the sales series once per brand for several ready runs", async () => {
    prismaMock.forecast_validation_run.findMany.mockResolvedValue([
      dueRun({ id: 7, model_id: "seasonal_trend" }),
      dueRun({ id: 8, model_id: "calendar_boost" }),
    ]);
    latestMock.mockResolvedValue("2026-10-20");
    seriesMock.mockResolvedValue([]);

    const result = await validation.evaluateDueForecastValidationRuns({
      trigger: "cron",
      now: NOW,
    });

    expect(result.status).toBe("ran");
    if (result.status !== "ran") return;
    expect(result.summary.evaluated).toBe(2);
    expect(latestMock).toHaveBeenCalledTimes(1);
    expect(seriesMock).toHaveBeenCalledTimes(1);
    // No sales at all → quality unknown, but the run is still closed out.
    expect(result.summary.outcomes.map((outcome) => outcome.quality)).toEqual([
      null,
      null,
    ]);
  });

  it("does not write in dry-run mode", async () => {
    prismaMock.forecast_validation_run.findMany.mockResolvedValue([dueRun()]);
    latestMock.mockResolvedValue("2026-10-14");
    seriesMock.mockResolvedValue([]);

    const result = await validation.evaluateDueForecastValidationRuns({
      trigger: "cli",
      dryRun: true,
      now: NOW,
    });

    expect(result.status).toBe("ran");
    if (result.status !== "ran") return;
    expect(result.summary.evaluated).toBe(1);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("reports a warehouse failure as an error and leaves the run pending", async () => {
    prismaMock.forecast_validation_run.findMany.mockResolvedValue([dueRun()]);
    latestMock.mockRejectedValue(new Error("ClickHouse down"));

    const result = await validation.evaluateDueForecastValidationRuns({
      trigger: "cron",
      now: NOW,
    });

    expect(result.status).toBe("ran");
    if (result.status !== "ran") return;
    expect(result.summary.errors).toBe(1);
    expect(result.summary.outcomes[0]).toMatchObject({
      status: "error",
      reason: expect.stringContaining("ClickHouse down"),
    });
    expect(prismaMock.forecast_validation_run.update).not.toHaveBeenCalled();
  });

  it("skips when another process holds the lock", async () => {
    lockMock.mockResolvedValue(null);

    const result = await validation.evaluateDueForecastValidationRuns({
      trigger: "cron",
    });

    expect(result).toEqual({
      status: "skipped",
      reason: expect.stringContaining("already evaluating"),
    });
    expect(prismaMock.forecast_validation_run.findMany).not.toHaveBeenCalled();
  });
});
