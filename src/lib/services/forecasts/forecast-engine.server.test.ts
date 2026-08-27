import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ForecastEnv } from "$lib/server/env";
import type {
  EngineForecastRequest,
  ForecastError,
} from "./forecast-engine.server";

vi.mock("$lib/server/env", () => ({
  getForecastEnv: vi.fn(),
}));

const { getForecastEnv } = await import("$lib/server/env");
const engine = await import("./forecast-engine.server");

const envMock = vi.mocked(getForecastEnv);

const baseEnv: ForecastEnv = {
  FORECAST_SERVICE_URL: "http://forecast:8000",
  FORECAST_SERVICE_TOKEN: "secret-token",
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
    description: "Prophet",
    version: "1",
    minHistoryDays: 56,
    recommendedHorizons: [7, 14, 30, 90],
    supportsHolidays: true,
  },
];

function makeEngineResult() {
  return {
    modelId: "seasonal_trend",
    modelName: "Seasonal Trend",
    modelVersion: "1",
    engineVersion: "0.1.0",
    horizonDays: 7,
    cutoffDate: "2026-08-25",
    history: [{ ds: "2026-08-24", y: 100, fitted: 98 }],
    forecast: [
      { ds: "2026-08-26", yhat: 100, lo80: 90, hi80: 110, lo95: 80, hi95: 120 },
    ],
    summary: {
      horizonTotal: 700,
      horizonLower80: 630,
      horizonUpper80: 770,
      samePeriodLastYear: null,
      vsLastYearPct: null,
      trailingPeriodTotal: 690,
      vsTrailingPct: 1.4,
      averageDaily: 100,
      peakDay: "2026-08-29",
      peakDayValue: 130,
      lowDay: "2026-08-27",
      lowDayValue: 80,
      averageOrderValue: 12.5,
    },
    accuracy: {
      holdoutDays: 7,
      folds: 1,
      wapePct: 9.1,
      mapePct: 10.2,
      mae: 12,
      biasPct: -1.2,
      coverage80Pct: 82,
      grade: "high",
      gradeLabel: "High confidence",
    },
    trendDirection: "up",
    trendPctPer30d: 2.1,
    seasonality: {
      strongestWeekday: "Saturday",
      weakestWeekday: "Tuesday",
      weekdayUpliftPct: 18,
      yearlySeasonalityUsed: true,
      holidaysUsed: true,
      upcomingHolidays: [],
      notes: [],
    },
    warnings: [],
    runtimeMs: 1234,
    generatedAt: "2026-08-27T10:00:00Z",
  };
}

const request: EngineForecastRequest = {
  modelId: "seasonal_trend",
  horizonDays: 7,
  country: "CY",
  backtestFolds: 1,
  seriesLabel: "bk",
  series: [{ ds: "2026-08-24", y: 100, orders: 8 }],
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    expect(engine.isForecastError(err)).toBe(true);
    const error = err as ForecastError;
    return { code: error.code, retryable: error.retryable, error };
  }
  throw new Error("expected a rejection");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  envMock.mockReturnValue({ ...baseEnv });
  engine.__clearForecastModelsCache();
  engine.__setForecastEngineTransportForTesting(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  engine.__setForecastEngineTransportForTesting(null);
});

describe("ForecastError", () => {
  it("derives retryable from the code unless overridden", () => {
    expect(new engine.ForecastError("ENGINE_TIMEOUT", "x").retryable).toBe(
      true,
    );
    expect(new engine.ForecastError("UNKNOWN_MODEL", "x").retryable).toBe(
      false,
    );
    expect(
      new engine.ForecastError("ENGINE_REJECTED", "x", { retryable: true })
        .retryable,
    ).toBe(true);
  });
});

describe("createHttpTransport", () => {
  it("sends the bearer header, JSON body and abort signal to the engine", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, makeEngineResult()));
    const transport = engine.createHttpTransport({
      baseUrl: "http://forecast:8000/",
      token: "secret-token",
      fetchFn,
    });
    const signal = new AbortController().signal;

    await transport.forecast(request, signal);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://forecast:8000/forecast");
    expect(init.method).toBe("POST");
    expect(init.signal).toBe(signal);
    expect(init.headers).toMatchObject({
      authorization: "Bearer secret-token",
      "content-type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual(request);
  });

  it("omits the authorization header when no token is configured", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, catalog));
    const transport = engine.createHttpTransport({
      baseUrl: "http://forecast:8000",
      fetchFn,
    });

    await transport.listModels(new AbortController().signal);

    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://forecast:8000/models");
    expect(init.method).toBe("GET");
    expect(init.headers).not.toHaveProperty("authorization");
  });

  it.each([
    [
      404,
      { error: { code: "UNKNOWN_MODEL", message: "nope" } },
      "UNKNOWN_MODEL",
      false,
    ],
    [
      422,
      { error: { code: "INSUFFICIENT_HISTORY", message: "need 56 days" } },
      "INSUFFICIENT_HISTORY",
      false,
    ],
    [
      422,
      { error: { code: "INVALID_SERIES", message: "unsorted" } },
      "ENGINE_REJECTED",
      false,
    ],
    [400, { detail: "bad" }, "ENGINE_REJECTED", false],
    [
      401,
      { error: { code: "UNAUTHORIZED", message: "bad token" } },
      "ENGINE_REJECTED",
      false,
    ],
    [
      429,
      { error: { code: "BUSY", message: "busy" } },
      "ENGINE_REJECTED",
      true,
    ],
    [
      500,
      { error: { code: "MODEL_FAILED", message: "boom" } },
      "ENGINE_UNAVAILABLE",
      true,
    ],
    [503, "", "ENGINE_UNAVAILABLE", true],
    [
      504,
      { error: { code: "TIMEOUT", message: "slow" } },
      "ENGINE_TIMEOUT",
      true,
    ],
  ])(
    "maps engine status %i to %s",
    async (status, body, expectedCode, expectedRetryable) => {
      const fetchFn = vi.fn(async () =>
        typeof body === "string"
          ? new Response(body, { status })
          : jsonResponse(status, body),
      );
      const transport = engine.createHttpTransport({
        baseUrl: "http://forecast:8000",
        fetchFn,
      });

      const { code, retryable } = await codeOf(
        transport.forecast(request, new AbortController().signal),
      );

      expect(code).toBe(expectedCode);
      expect(retryable).toBe(expectedRetryable);
    },
  );

  it("passes the engine message through for INSUFFICIENT_HISTORY and ENGINE_REJECTED", async () => {
    const insufficient = engine.mapEngineHttpError(422, {
      error: {
        code: "INSUFFICIENT_HISTORY",
        message: "Only 41 usable days; need 56.",
        details: { usableDays: 41 },
      },
    });
    expect(insufficient.message).toBe("Only 41 usable days; need 56.");
    expect(insufficient.details).toEqual({ usableDays: 41 });

    const rejected = engine.mapEngineHttpError(422, {
      error: { code: "INVALID_SERIES", message: "Dates must be sorted." },
    });
    expect(rejected.message).toBe("Dates must be sorted.");
    expect(rejected.details).toMatchObject({
      status: 422,
      engineCode: "INVALID_SERIES",
    });
  });

  it("maps network failures to ENGINE_UNAVAILABLE and aborts to ENGINE_TIMEOUT", async () => {
    const refused = engine.createHttpTransport({
      baseUrl: "http://forecast:8000",
      fetchFn: vi.fn(async () => {
        throw Object.assign(new Error("connect ECONNREFUSED"), {
          code: "ECONNREFUSED",
        });
      }),
    });
    expect(
      await codeOf(refused.listModels(new AbortController().signal)),
    ).toMatchObject({ code: "ENGINE_UNAVAILABLE", retryable: true });

    const timedOut = engine.createHttpTransport({
      baseUrl: "http://forecast:8000",
      fetchFn: vi.fn(async () => {
        throw Object.assign(new Error("The operation was aborted"), {
          name: "TimeoutError",
        });
      }),
    });
    expect(
      await codeOf(timedOut.forecast(request, new AbortController().signal)),
    ).toMatchObject({ code: "ENGINE_TIMEOUT", retryable: true });
  });

  it("treats a 2xx without JSON as INVALID_RESPONSE", async () => {
    const transport = engine.createHttpTransport({
      baseUrl: "http://forecast:8000",
      fetchFn: vi.fn(async () => new Response("<html>", { status: 200 })),
    });

    expect(
      await codeOf(transport.listModels(new AbortController().signal)),
    ).toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

describe("listForecastModels", () => {
  it("throws NOT_CONFIGURED when the service URL is unset", async () => {
    envMock.mockReturnValue({ ...baseEnv, FORECAST_SERVICE_URL: undefined });

    expect(await codeOf(engine.listForecastModels())).toMatchObject({
      code: "NOT_CONFIGURED",
      retryable: false,
    });
  });

  it("validates the catalog and caches it for the configured TTL", async () => {
    const listModels = vi.fn(async (_signal: AbortSignal) => catalog);
    engine.__setForecastEngineTransportForTesting({
      listModels,
      forecast: vi.fn(),
    });

    const first = await engine.listForecastModels({ now: 1_000 });
    const cachedHit = await engine.listForecastModels({
      now: 1_000 + baseEnv.FORECAST_MODELS_TTL_MS - 1,
    });
    expect(first).toEqual(catalog);
    expect(cachedHit).toBe(first);
    expect(listModels).toHaveBeenCalledTimes(1);
    expect(listModels.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal);

    await engine.listForecastModels({
      now: 1_000 + baseEnv.FORECAST_MODELS_TTL_MS,
    });
    expect(listModels).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight request between concurrent callers", async () => {
    let resolveModels: (value: unknown) => void = () => {};
    const listModels = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolveModels = resolve;
        }),
    );
    engine.__setForecastEngineTransportForTesting({
      listModels,
      forecast: vi.fn(),
    });

    const a = engine.listForecastModels({ now: 5 });
    const b = engine.listForecastModels({ now: 5 });
    resolveModels(catalog);

    expect(await a).toEqual(catalog);
    expect(await b).toEqual(catalog);
    expect(listModels).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed catalog with INVALID_RESPONSE and does not cache it", async () => {
    const listModels = vi
      .fn()
      .mockResolvedValueOnce({ models: catalog })
      .mockResolvedValueOnce(catalog);
    engine.__setForecastEngineTransportForTesting({
      listModels,
      forecast: vi.fn(),
    });

    expect(await codeOf(engine.listForecastModels({ now: 1 }))).toMatchObject({
      code: "INVALID_RESPONSE",
    });
    await expect(engine.listForecastModels({ now: 1 })).resolves.toEqual(
      catalog,
    );
    expect(listModels).toHaveBeenCalledTimes(2);
  });
});

describe("runForecast", () => {
  it("forwards the request to the transport and validates the result", async () => {
    const forecast = vi.fn(async () => makeEngineResult());
    engine.__setForecastEngineTransportForTesting({
      listModels: vi.fn(),
      forecast,
    });

    const result = await engine.runForecast(request);

    expect(forecast).toHaveBeenCalledWith(request, expect.any(AbortSignal));
    expect(result.modelId).toBe("seasonal_trend");
    expect(result.forecast).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });

  it("logs only aggregate numbers, never the series", async () => {
    engine.__setForecastEngineTransportForTesting({
      listModels: vi.fn(),
      forecast: vi.fn(async () => makeEngineResult()),
    });
    const info = vi.mocked(console.info);

    await engine.runForecast(request);

    expect(info).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(info.mock.calls[0]);
    expect(logged).toContain('"points":1');
    expect(logged).not.toContain("2026-08-24");
  });

  it("maps a contract mismatch to INVALID_RESPONSE", async () => {
    const broken = { ...makeEngineResult(), forecast: [{ ds: "2026-08-26" }] };
    engine.__setForecastEngineTransportForTesting({
      listModels: vi.fn(),
      forecast: vi.fn(async () => broken),
    });

    expect(await codeOf(engine.runForecast(request))).toMatchObject({
      code: "INVALID_RESPONSE",
      retryable: false,
    });
  });

  it("propagates transport ForecastErrors untouched", async () => {
    engine.__setForecastEngineTransportForTesting({
      listModels: vi.fn(),
      forecast: vi.fn(async () => {
        throw new engine.ForecastError("INSUFFICIENT_HISTORY", "need 56");
      }),
    });

    const { code, error } = await codeOf(engine.runForecast(request));
    expect(code).toBe("INSUFFICIENT_HISTORY");
    expect(error.message).toBe("need 56");
  });
});
