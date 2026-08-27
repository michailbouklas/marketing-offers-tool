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
  "$lib/services/forecasts/forecast-series.server",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("$lib/services/forecasts/forecast-series.server")
    >()),
    getSalesHistorySummary: vi.fn(),
  }),
);

const guards = await import("$lib/server/auth-guards");
const scope = await import("$lib/services/forecasts/forecast-scope.server");
const seriesModule =
  await import("$lib/services/forecasts/forecast-series.server");
const { GET } = await import("./+server");

const requireUserMock = vi.mocked(guards.requireAuthenticatedApiUser);
const resolveBrandMock = vi.mocked(scope.resolveForecastBrand);
const summaryMock = vi.mocked(seriesModule.getSalesHistorySummary);

function httpError(status: number, message: string): unknown {
  try {
    error(status, message);
  } catch (err) {
    return err;
  }
  throw new Error("unreachable");
}

function makeEvent(search: string) {
  return {
    url: new URL(`http://test.local/api/forecasts/history${search}`),
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
  requireUserMock.mockReturnValue({
    session: {},
    user: { id: "user-1" },
  } as unknown as ReturnType<typeof guards.requireAuthenticatedApiUser>);
  resolveBrandMock.mockResolvedValue({
    userId: "user-1",
    brands: [{ alias: "bk", name: "Burger King" }],
    brand: { alias: "bk", name: "Burger King" },
  });
  summaryMock.mockResolvedValue({
    latestSalesDate: "2026-08-25",
    historyDays: 900,
    points: [{ ds: "2026-08-25", revenue: 100, orders: 8 }],
  });
});

describe("GET /api/forecasts/history", () => {
  it("returns the history summary for a scoped brand", async () => {
    const response = await GET(makeEvent("?brand=BK&days=120"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      brandAlias: "bk",
      latestSalesDate: "2026-08-25",
      historyDays: 900,
      points: [{ ds: "2026-08-25", revenue: 100, orders: 8 }],
    });
    expect(resolveBrandMock).toHaveBeenCalledWith(expect.anything(), "BK", {
      guard: "api",
    });
    expect(summaryMock).toHaveBeenCalledWith("bk", { recentDays: 120 });
  });

  it("defaults days to 90", async () => {
    await GET(makeEvent("?brand=bk"));

    expect(summaryMock).toHaveBeenCalledWith("bk", { recentDays: 90 });
  });

  it("answers 401 when there is no session", async () => {
    requireUserMock.mockImplementation(() => {
      throw httpError(401, "Unauthorized");
    });

    expect(await statusOf(GET(makeEvent("?brand=bk")))).toBe(401);
  });

  it("answers 400 when brand is missing or days is out of range", async () => {
    const missing = await GET(makeEvent(""));
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: "BAD_REQUEST" },
    });

    const outOfRange = await GET(makeEvent("?brand=bk&days=5000"));
    expect(outOfRange.status).toBe(400);
    expect(resolveBrandMock).not.toHaveBeenCalled();
  });

  it("answers 403 FORBIDDEN envelope for a brand outside the scope", async () => {
    resolveBrandMock.mockRejectedValue(
      httpError(403, "This brand is not assigned to you."),
    );

    const response = await GET(makeEvent("?brand=phcy"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "FORBIDDEN",
        message: "This brand is not assigned to you.",
      },
    });
    expect(summaryMock).not.toHaveBeenCalled();
  });

  it("answers 422 NO_SALES_DATA when the brand has no sales", async () => {
    summaryMock.mockResolvedValue(null);

    const response = await GET(makeEvent("?brand=bk"));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NO_SALES_DATA" },
    });
  });

  it("answers 500 with a generic envelope for unexpected failures", async () => {
    summaryMock.mockRejectedValue(new Error("clickhouse exploded"));

    const response = await GET(makeEvent("?brand=bk"));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.message).not.toContain("clickhouse");
  });
});
