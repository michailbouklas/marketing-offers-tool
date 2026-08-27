import { beforeEach, describe, expect, it, vi } from "vitest";
import { error } from "@sveltejs/kit";

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

vi.mock("$lib/services/forecasts/forecast-scope.server", () => ({
  FORECASTS_PERMISSION: { forecasts: ["view"] },
  resolveForecastBrand: vi.fn(),
}));

vi.mock(
  "$lib/services/forecasts/forecast-engine.server",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("$lib/services/forecasts/forecast-engine.server")
    >()),
    listForecastModels: vi.fn(),
  }),
);

const guards = await import("$lib/server/auth-guards");
const engine = await import("$lib/services/forecasts/forecast-engine.server");
const { GET } = await import("./+server");

const requirePermissionMock = vi.mocked(guards.requireApiPermission);
const listModelsMock = vi.mocked(engine.listForecastModels);

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

function httpError(status: number, message: string): unknown {
  try {
    error(status, message);
  } catch (err) {
    return err;
  }
  throw new Error("unreachable");
}

function makeEvent() {
  return {
    url: new URL("http://test.local/api/forecasts/models"),
    locals: { session: {}, user: { id: "user-1" } },
  } as unknown as Parameters<typeof GET>[0];
}

async function statusOf(result: unknown): Promise<number> {
  try {
    await result;
  } catch (err) {
    return (err as { status: number }).status;
  }
  throw new Error("expected the handler to throw");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requirePermissionMock.mockResolvedValue({
    session: {},
    user: { id: "user-1" },
  } as unknown as Awaited<ReturnType<typeof guards.requireApiPermission>>);
  listModelsMock.mockResolvedValue(catalog);
});

describe("GET /api/forecasts/models", () => {
  it("returns the catalog for a permitted user", async () => {
    const response = await GET(makeEvent());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ models: catalog });
    expect(requirePermissionMock).toHaveBeenCalledWith(expect.anything(), {
      forecasts: ["view"],
    });
  });

  it("propagates 401 from the guard", async () => {
    requirePermissionMock.mockRejectedValue(httpError(401, "Unauthorized"));

    expect(await statusOf(GET(makeEvent()))).toBe(401);
    expect(listModelsMock).not.toHaveBeenCalled();
  });

  it("propagates 403 from the guard", async () => {
    requirePermissionMock.mockRejectedValue(httpError(403, "Forbidden"));

    expect(await statusOf(GET(makeEvent()))).toBe(403);
  });

  it("answers 503 with a typed envelope when the engine is down", async () => {
    listModelsMock.mockRejectedValue(
      new engine.ForecastError("ENGINE_UNAVAILABLE", "down"),
    );

    const response = await GET(makeEvent());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: { code: "ENGINE_UNAVAILABLE", message: "down" },
    });
  });

  it("answers 503 NOT_CONFIGURED when the service URL is unset", async () => {
    listModelsMock.mockRejectedValue(
      new engine.ForecastError("NOT_CONFIGURED", "unset"),
    );

    const response = await GET(makeEvent());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_CONFIGURED" },
    });
  });

  it("answers 500 with a generic envelope for unexpected failures", async () => {
    listModelsMock.mockRejectedValue(new Error("kaboom"));

    const response = await GET(makeEvent());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.message).not.toContain("kaboom");
  });
});
