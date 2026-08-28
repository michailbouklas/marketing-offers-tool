import { beforeEach, describe, expect, it, vi } from "vitest";
import { error } from "@sveltejs/kit";
import type { ForecastResult } from "$lib/services/forecasts/forecast-types";

vi.mock("$lib/server/auth-guards", () => ({
  requireApiPermission: vi.fn(),
  requireAuthenticatedApiUser: vi.fn(),
}));

vi.mock("$lib/server/env", () => ({
  getForecastEnv: vi.fn(() => ({
    FORECAST_SERVICE_URL: "http://forecast:8000",
    FORECAST_SERVICE_TOKEN: undefined,
    FORECAST_TIMEOUT_MS: 75_000,
    FORECAST_HISTORY_DAYS: 1095,
    FORECAST_CACHE_TTL_MS: 21_600_000,
    FORECAST_MODELS_TTL_MS: 600_000,
    FORECAST_DEFAULT_COUNTRY: "CY",
    CLICKHOUSE_SALES_DATABASE: "default",
  })),
}));

vi.mock("$lib/server/clickhouse", () => ({
  clickhouse: { query: vi.fn() },
}));

vi.mock("$lib/services/forecasts/forecast-series.server", () => ({
  listBrandLocations: vi.fn(),
}));

vi.mock("$lib/services/forecasts/forecast-scope.server", () => ({
  FORECASTS_PERMISSION: { forecasts: ["view"] },
  resolveForecastBrand: vi.fn(),
}));

vi.mock(
  "$lib/services/forecasts/forecast-run.server",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("$lib/services/forecasts/forecast-run.server")
    >()),
    getForecastForBrand: vi.fn(),
  }),
);

const guards = await import("$lib/server/auth-guards");
const scope = await import("$lib/services/forecasts/forecast-scope.server");
const runModule = await import("$lib/services/forecasts/forecast-run.server");
const { ForecastError } =
  await import("$lib/services/forecasts/forecast-engine.server");
const seriesModule =
  await import("$lib/services/forecasts/forecast-series.server");
const { POST } = await import("./+server");
const locationsMock = vi.mocked(seriesModule.listBrandLocations);

const requireUserMock = vi.mocked(guards.requireAuthenticatedApiUser);
const resolveBrandMock = vi.mocked(scope.resolveForecastBrand);
const getForecastMock = vi.mocked(runModule.getForecastForBrand);

function httpError(status: number, message: string): unknown {
  try {
    error(status, message);
  } catch (err) {
    return err;
  }
  throw new Error("unreachable");
}

function makeResult(): ForecastResult {
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
    brandAlias: "bk",
    brandName: "Burger King",
    cached: false,
    missingDays: 0,
  };
}

function makeEvent(body: unknown, options: { invalidJson?: boolean } = {}) {
  return {
    request: {
      json: async () => {
        if (options.invalidJson) {
          throw new SyntaxError("Unexpected token");
        }
        return body;
      },
    },
    url: new URL("http://test.local/api/forecasts/run"),
    locals: { session: {}, user: { id: "user-1" } },
  } as unknown as Parameters<typeof POST>[0];
}

async function statusOf(result: unknown): Promise<number> {
  try {
    await result;
  } catch (err) {
    return (err as { status: number }).status;
  }
  throw new Error("expected the handler to throw");
}

const validBody = {
  brandAlias: "bk",
  modelId: "seasonal_trend",
  horizonDays: 30,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireUserMock.mockReturnValue({
    session: {},
    user: { id: "user-1" },
  } as unknown as ReturnType<typeof guards.requireAuthenticatedApiUser>);
  resolveBrandMock.mockResolvedValue({
    userId: "user-1",
    brands: [{ alias: "bk", name: "Burger King" }],
    brand: { alias: "bk", name: "Burger King" },
  });
  getForecastMock.mockResolvedValue(makeResult());
});

describe("POST /api/forecasts/run", () => {
  it("runs one model for one scoped brand", async () => {
    const response = await POST(makeEvent(validBody));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      modelId: "seasonal_trend",
      brandAlias: "bk",
      cached: false,
    });
    expect(resolveBrandMock).toHaveBeenCalledWith(expect.anything(), "bk", {
      guard: "api",
    });
    expect(getForecastMock).toHaveBeenCalledWith({
      brandAlias: "bk",
      brandName: "Burger King",
      modelId: "seasonal_trend",
      horizonDays: 30,
      locationId: null,
      locationName: null,
    });
    expect(locationsMock).not.toHaveBeenCalled();
  });

  it("resolves a location of the brand and forwards it", async () => {
    locationsMock.mockResolvedValue([
      { id: 12, name: "Limassol Marina" },
      { id: 3, name: "Nicosia Mall" },
    ]);

    const response = await POST(
      makeEvent({
        brandAlias: "bk",
        modelId: "seasonal_trend",
        horizonDays: 30,
        locationId: 12,
      }),
    );

    expect(response.status).toBe(200);
    expect(locationsMock).toHaveBeenCalledWith("bk");
    expect(getForecastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: 12,
        locationName: "Limassol Marina",
      }),
    );
  });

  it("answers 400 when the location does not belong to the brand", async () => {
    locationsMock.mockResolvedValue([{ id: 3, name: "Nicosia Mall" }]);

    const response = await POST(
      makeEvent({
        brandAlias: "bk",
        modelId: "seasonal_trend",
        horizonDays: 30,
        locationId: 999,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "BAD_REQUEST" },
    });
    expect(getForecastMock).not.toHaveBeenCalled();
  });

  it("uses the stored alias from the scope, not the request's spelling", async () => {
    resolveBrandMock.mockResolvedValue({
      userId: "user-1",
      brands: [{ alias: "BK", name: "Burger King" }],
      brand: { alias: "BK", name: "Burger King" },
    });

    await POST(makeEvent({ ...validBody, brandAlias: "bk" }));

    expect(getForecastMock).toHaveBeenCalledWith(
      expect.objectContaining({ brandAlias: "BK" }),
    );
  });

  it("answers 401 when there is no session", async () => {
    requireUserMock.mockImplementation(() => {
      throw httpError(401, "Unauthorized");
    });

    expect(await statusOf(POST(makeEvent(validBody)))).toBe(401);
    expect(resolveBrandMock).not.toHaveBeenCalled();
  });

  it("answers 400 BAD_REQUEST for a non-JSON body", async () => {
    const response = await POST(makeEvent(null, { invalidJson: true }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "BAD_REQUEST" },
    });
    expect(resolveBrandMock).not.toHaveBeenCalled();
  });

  it("answers 400 BAD_REQUEST for garbage", async () => {
    const response = await POST(
      makeEvent({ brandAlias: "", modelId: "x", horizonDays: 45 }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.message).toContain("horizonDays");
    expect(getForecastMock).not.toHaveBeenCalled();
  });

  it("answers 403 FORBIDDEN envelope when the brand is out of scope", async () => {
    resolveBrandMock.mockRejectedValue(
      httpError(403, "This brand is not assigned to you."),
    );

    const response = await POST(makeEvent(validBody));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "FORBIDDEN",
        message: "This brand is not assigned to you.",
      },
    });
    expect(getForecastMock).not.toHaveBeenCalled();
  });

  it("propagates other HttpErrors from the guard", async () => {
    resolveBrandMock.mockRejectedValue(httpError(401, "Unauthorized"));

    expect(await statusOf(POST(makeEvent(validBody)))).toBe(401);
  });

  it.each([
    ["UNKNOWN_MODEL", 404],
    ["INSUFFICIENT_HISTORY", 422],
    ["NO_SALES_DATA", 422],
    ["ENGINE_REJECTED", 502],
    ["INVALID_RESPONSE", 502],
    ["ENGINE_UNAVAILABLE", 503],
    ["NOT_CONFIGURED", 503],
    ["ENGINE_TIMEOUT", 504],
  ] as const)("maps ForecastError %s to %i", async (code, status) => {
    getForecastMock.mockRejectedValue(new ForecastError(code, "why"));

    const response = await POST(makeEvent(validBody));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({
      error: { code, message: "why" },
    });
  });

  it("answers 500 with a generic envelope and logs unexpected failures", async () => {
    getForecastMock.mockRejectedValue(new Error("clickhouse exploded"));

    const response = await POST(makeEvent(validBody));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.message).not.toContain("clickhouse");
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
