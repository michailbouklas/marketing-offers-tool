import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ForecastEnv } from "$lib/server/env";
import type { ForecastError } from "./forecast-engine.server";
import type { ForecastResult } from "./forecast-types";

vi.mock("$lib/server/env", () => ({
  getForecastEnv: vi.fn(),
}));

vi.mock("./forecast-engine.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./forecast-engine.server")>()),
  listForecastModels: vi.fn(),
  runForecast: vi.fn(),
}));

vi.mock("./forecast-series.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./forecast-series.server")>()),
  getLatestSalesDate: vi.fn(),
  getDailySalesSeries: vi.fn(),
}));

const { getForecastEnv } = await import("$lib/server/env");
const engine = await import("./forecast-engine.server");
const seriesModule = await import("./forecast-series.server");
const run = await import("./forecast-run.server");

const envMock = vi.mocked(getForecastEnv);
const listModelsMock = vi.mocked(engine.listForecastModels);
const runForecastMock = vi.mocked(engine.runForecast);
const latestMock = vi.mocked(seriesModule.getLatestSalesDate);
const seriesMock = vi.mocked(seriesModule.getDailySalesSeries);

const baseEnv: ForecastEnv = {
  FORECAST_SERVICE_URL: "http://forecast:8000",
  FORECAST_SERVICE_TOKEN: undefined,
  FORECAST_TIMEOUT_MS: 75_000,
  FORECAST_HISTORY_DAYS: 1095,
  FORECAST_CACHE_TTL_MS: 21_600_000,
  FORECAST_MODELS_TTL_MS: 600_000,
  FORECAST_DEFAULT_COUNTRY: "CY",
  CLICKHOUSE_SALES_DATABASE: "default",
};

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
];

function makeEngineResult(): ForecastResult {
  return {
    modelId: "seasonal_trend",
    modelName: "Seasonal Trend",
    modelVersion: "1",
    engineVersion: "0.1.0",
    horizonDays: 30,
    cutoffDate: "2026-08-25",
    history: [],
    forecast: [],
    summary: {
      horizonTotal: 3000,
      horizonLower80: 2700,
      horizonUpper80: 3300,
      samePeriodLastYear: null,
      vsLastYearPct: null,
      trailingPeriodTotal: 2900,
      vsTrailingPct: 3.4,
      averageDaily: 100,
      peakDay: "2026-08-30",
      peakDayValue: 130,
      lowDay: "2026-08-27",
      lowDayValue: 80,
      averageOrderValue: null,
    },
    accuracy: null,
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
    warnings: [],
    runtimeMs: 10,
    generatedAt: "2026-08-27T10:00:00Z",
  };
}

function makeSeries(days: number, from = "2026-06-01") {
  return Array.from({ length: days }, (_, index) => ({
    ds: seriesModule.addDays(from, index),
    revenue: 100 + index,
    orders: 10,
  }));
}

const input = {
  brandAlias: "bk",
  brandName: "Burger King",
  modelId: "seasonal_trend",
  horizonDays: 30,
};

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    expect(engine.isForecastError(err)).toBe(true);
    return err as ForecastError;
  }
  throw new Error("expected a rejection");
}

beforeEach(() => {
  vi.clearAllMocks();
  run.__clearForecastRunCache();
  envMock.mockReturnValue({ ...baseEnv });
  listModelsMock.mockResolvedValue(catalog);
  latestMock.mockResolvedValue("2026-08-25");
  seriesMock.mockResolvedValue(makeSeries(86));
  runForecastMock.mockResolvedValue(makeEngineResult());
});

describe("getForecastForBrand", () => {
  it("rejects unknown models before touching ClickHouse", async () => {
    const err = await codeOf(
      run.getForecastForBrand({ ...input, modelId: "nope" }),
    );

    expect(err.code).toBe("UNKNOWN_MODEL");
    expect(latestMock).not.toHaveBeenCalled();
  });

  it("reports NO_SALES_DATA when the brand has no latest sales date", async () => {
    latestMock.mockResolvedValue(null);

    const err = await codeOf(run.getForecastForBrand(input));

    expect(err.code).toBe("NO_SALES_DATA");
    expect(err.message).toContain("Burger King");
    expect(seriesMock).not.toHaveBeenCalled();
  });

  it("reports INSUFFICIENT_HISTORY with counts and never calls the engine", async () => {
    seriesMock.mockResolvedValue(makeSeries(41));

    const err = await codeOf(run.getForecastForBrand(input));

    expect(err.code).toBe("INSUFFICIENT_HISTORY");
    expect(err.message).toBe(
      "Burger King has 41 days of sales history; Seasonal Trend needs at least 56.",
    );
    expect(err.details).toEqual({
      historyDays: 41,
      minHistoryDays: 56,
      modelId: "seasonal_trend",
    });
    expect(runForecastMock).not.toHaveBeenCalled();
  });

  it("queries the lookback window, sends the sparse series and attaches brand metadata", async () => {
    const series = [
      { ds: "2026-08-20", revenue: 100, orders: 8 },
      ...makeSeries(60, "2026-06-01"),
    ];
    seriesMock.mockResolvedValue(series);

    const result = await run.getForecastForBrand(input, { now: 1_000 });

    expect(seriesMock).toHaveBeenCalledWith({
      brandAlias: "bk",
      from: "2023-08-27",
      to: "2026-08-25",
      locationId: null,
    });
    expect(runForecastMock).toHaveBeenCalledTimes(1);
    expect(runForecastMock.mock.calls[0]?.[0]).toEqual({
      modelId: "seasonal_trend",
      horizonDays: 30,
      country: "CY",
      backtestFolds: 1,
      seriesLabel: "bk",
      series: series.map((point) => ({
        ds: point.ds,
        y: point.revenue,
        orders: point.orders,
      })),
    });
    expect(result).toMatchObject({
      modelId: "seasonal_trend",
      brandAlias: "bk",
      brandName: "Burger King",
      cached: false,
      locationId: null,
      locationName: null,
    });
    // 2026-06-01 .. 2026-08-25 = 86 days, 61 present.
    expect(result.missingDays).toBe(25);
  });

  it("serves a cached result (flagged) while the latest sales date and TTL hold", async () => {
    const first = await run.getForecastForBrand(input, { now: 1_000 });
    const second = await run.getForecastForBrand(input, {
      now: 1_000 + baseEnv.FORECAST_CACHE_TTL_MS - 1,
    });

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.modelId).toBe(first.modelId);
    expect(runForecastMock).toHaveBeenCalledTimes(1);
    expect(seriesMock).toHaveBeenCalledTimes(1);
  });

  it("misses the cache when a new warehouse day arrives", async () => {
    await run.getForecastForBrand(input, { now: 1_000 });
    latestMock.mockResolvedValue("2026-08-26");

    const result = await run.getForecastForBrand(input, { now: 2_000 });

    expect(result.cached).toBe(false);
    expect(runForecastMock).toHaveBeenCalledTimes(2);
  });

  it("misses the cache once the TTL has elapsed", async () => {
    await run.getForecastForBrand(input, { now: 1_000 });

    const result = await run.getForecastForBrand(input, {
      now: 1_000 + baseEnv.FORECAST_CACHE_TTL_MS,
    });

    expect(result.cached).toBe(false);
    expect(runForecastMock).toHaveBeenCalledTimes(2);
  });

  it("keys the cache by brand, model and horizon", async () => {
    await run.getForecastForBrand(input, { now: 1_000 });
    await run.getForecastForBrand({ ...input, horizonDays: 7 }, { now: 1_000 });
    await run.getForecastForBrand(
      { ...input, brandAlias: "KFC", brandName: "KFC" },
      { now: 1_000 },
    );
    const sameBrandDifferentCase = await run.getForecastForBrand(
      { ...input, brandAlias: "BK" },
      { now: 1_000 },
    );

    expect(runForecastMock).toHaveBeenCalledTimes(3);
    expect(sameBrandDifferentCase.cached).toBe(true);
  });

  it("keys the cache by location and forwards it to ClickHouse and the engine", async () => {
    const all = await run.getForecastForBrand(input, { now: 1_000 });
    const located = await run.getForecastForBrand(
      { ...input, locationId: 12, locationName: "Limassol Marina" },
      { now: 1_000 },
    );

    expect(all.cached).toBe(false);
    expect(located.cached).toBe(false);
    expect(runForecastMock).toHaveBeenCalledTimes(2);
    expect(latestMock).toHaveBeenLastCalledWith(
      "bk",
      expect.objectContaining({ locationId: 12 }),
    );
    expect(seriesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ brandAlias: "bk", locationId: 12 }),
    );
    expect(runForecastMock.mock.calls[1]?.[0]).toMatchObject({
      seriesLabel: "bk@12",
    });
    expect(all).toMatchObject({ locationId: null, locationName: null });
    expect(located).toMatchObject({
      locationId: 12,
      locationName: "Limassol Marina",
    });
  });

  it("dedupes concurrent runs for the same key into one engine call", async () => {
    let resolveRun: (value: ForecastResult) => void = () => {};
    runForecastMock.mockImplementation(
      () =>
        new Promise<ForecastResult>((resolve) => {
          resolveRun = resolve;
        }),
    );

    const a = run.getForecastForBrand(input, { now: 1_000 });
    const b = run.getForecastForBrand(input, { now: 1_000 });
    await vi.waitFor(() => expect(runForecastMock).toHaveBeenCalledTimes(1));
    resolveRun(makeEngineResult());

    const [resultA, resultB] = await Promise.all([a, b]);
    expect(resultA).toBe(resultB);
    expect(resultA.cached).toBe(false);
    expect(seriesMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures and clears the in-flight slot", async () => {
    runForecastMock.mockRejectedValueOnce(
      new engine.ForecastError("ENGINE_UNAVAILABLE", "down"),
    );

    const err = await codeOf(run.getForecastForBrand(input, { now: 1_000 }));
    expect(err.code).toBe("ENGINE_UNAVAILABLE");

    const retry = await run.getForecastForBrand(input, { now: 1_000 });
    expect(retry.cached).toBe(false);
    expect(runForecastMock).toHaveBeenCalledTimes(2);
  });

  it("bounds the cache and evicts the oldest entry", async () => {
    for (
      let index = 0;
      index < run.FORECAST_RUN_CACHE_MAX_ENTRIES;
      index += 1
    ) {
      await run.getForecastForBrand(
        { ...input, brandAlias: `brand-${index}` },
        { now: 1_000 },
      );
    }
    // One more pushes brand-0 out.
    await run.getForecastForBrand(
      { ...input, brandAlias: "brand-overflow" },
      { now: 1_000 },
    );
    const callsBefore = runForecastMock.mock.calls.length;

    // Check the survivor first: re-running brand-0 below would itself evict
    // the next-oldest entry.
    const kept = await run.getForecastForBrand(
      { ...input, brandAlias: "brand-1" },
      { now: 1_000 },
    );
    const evicted = await run.getForecastForBrand(
      { ...input, brandAlias: "brand-0" },
      { now: 1_000 },
    );

    expect(kept.cached).toBe(true);
    expect(evicted.cached).toBe(false);
    expect(runForecastMock.mock.calls.length).toBe(callsBefore + 1);
  });
});

describe("forecastErrorStatus / forecastErrorResponse", () => {
  it.each([
    ["BAD_REQUEST", 400],
    ["FORBIDDEN", 403],
    ["UNKNOWN_MODEL", 404],
    ["INSUFFICIENT_HISTORY", 422],
    ["NO_SALES_DATA", 422],
    ["ENGINE_REJECTED", 502],
    ["INVALID_RESPONSE", 502],
    ["ENGINE_UNAVAILABLE", 503],
    ["NOT_CONFIGURED", 503],
    ["ENGINE_TIMEOUT", 504],
    ["INTERNAL", 500],
  ] as const)("maps %s to HTTP %i", (code, status) => {
    expect(run.forecastErrorStatus(code)).toBe(status);
  });

  it("serialises the typed envelope", async () => {
    const response = run.forecastErrorResponse(
      new engine.ForecastError("INSUFFICIENT_HISTORY", "need more", {
        details: { historyDays: 41 },
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INSUFFICIENT_HISTORY",
        message: "need more",
        details: { historyDays: 41 },
      },
    });
  });

  it("omits details when absent", async () => {
    const response = run.forecastErrorResponse(
      new engine.ForecastError("ENGINE_TIMEOUT", "slow"),
    );

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({
      error: { code: "ENGINE_TIMEOUT", message: "slow" },
    });
  });
});
