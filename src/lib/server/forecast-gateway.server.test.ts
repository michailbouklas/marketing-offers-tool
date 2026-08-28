import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/services/forecasts/forecast-engine.server",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("$lib/services/forecasts/forecast-engine.server")
    >()),
    listForecastModels: vi.fn(),
  }),
);

vi.mock("$lib/services/forecasts/forecast-run.server", () => ({
  getForecastForBrand: vi.fn(),
}));

vi.mock("$lib/services/forecasts/forecast-series.server", () => ({
  getLocationHistoryCoverage: vi.fn(),
  getSalesHistorySummary: vi.fn(),
  listBrandLocations: vi.fn(),
}));

const engine = await import("$lib/services/forecasts/forecast-engine.server");
const run = await import("$lib/services/forecasts/forecast-run.server");
const series = await import("$lib/services/forecasts/forecast-series.server");
const registry = await import("$lib/server/mastra/tools/forecast-gateway");
const { createForecastGateway, installForecastGateway } =
  await import("./forecast-gateway.server");

const listModelsMock = vi.mocked(engine.listForecastModels);
const runMock = vi.mocked(run.getForecastForBrand);
const summaryMock = vi.mocked(series.getSalesHistorySummary);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  registry.setForecastGateway(null);
  vi.restoreAllMocks();
});

describe("createForecastGateway", () => {
  it("wraps successful service calls in ok outcomes", async () => {
    listModelsMock.mockResolvedValue([]);
    const gateway = createForecastGateway();

    await expect(gateway.listModels()).resolves.toEqual({
      ok: true,
      value: [],
    });
  });

  it("flattens ForecastError into a plain error outcome", async () => {
    runMock.mockRejectedValue(
      new engine.ForecastError("INSUFFICIENT_HISTORY", "needs 120 days", {
        details: { historyDays: 41 },
      }),
    );
    const gateway = createForecastGateway();

    const outcome = await gateway.runForecast({
      brandAlias: "bk",
      brandName: "BK",
      modelId: "blend",
      horizonDays: 30,
      locationId: null,
      locationName: null,
    });

    expect(outcome).toEqual({
      ok: false,
      error: {
        code: "INSUFFICIENT_HISTORY",
        message: "needs 120 days",
        retryable: false,
        details: { historyDays: 41 },
      },
    });
    expect(runMock).toHaveBeenCalledWith({
      brandAlias: "bk",
      brandName: "BK",
      modelId: "blend",
      horizonDays: 30,
      locationId: null,
      locationName: null,
    });
  });

  it("hides unexpected errors behind INTERNAL and logs them", async () => {
    runMock.mockRejectedValue(new Error("pool exhausted: secret host"));
    const gateway = createForecastGateway();

    const outcome = await gateway.runForecast({
      brandAlias: "bk",
      brandName: "BK",
      modelId: "blend",
      horizonDays: 30,
      locationId: null,
      locationName: null,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe("INTERNAL");
      expect(outcome.error.retryable).toBe(true);
      expect(outcome.error.message).not.toContain("secret host");
    }
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("pool exhausted"),
    );
  });

  it("reduces the history summary to coverage (null when no sales)", async () => {
    summaryMock.mockResolvedValueOnce({
      latestSalesDate: "2026-08-27",
      historyDays: 812,
      points: [],
    });
    summaryMock.mockResolvedValueOnce(null);
    const gateway = createForecastGateway();

    await expect(gateway.getBrandCoverage("bk", 7)).resolves.toEqual({
      ok: true,
      value: { latestSalesDate: "2026-08-27", historyDays: 812 },
    });
    expect(summaryMock).toHaveBeenCalledWith("bk", {
      recentDays: 0,
      locationId: 7,
    });
    await expect(gateway.getBrandCoverage("bk", null)).resolves.toEqual({
      ok: true,
      value: null,
    });
  });
});

describe("installForecastGateway", () => {
  it("installs once and keeps an existing gateway", () => {
    expect(registry.getForecastGateway()).toBeNull();

    installForecastGateway();
    const first = registry.getForecastGateway();
    expect(first).not.toBeNull();

    installForecastGateway();
    expect(registry.getForecastGateway()).toBe(first);
  });
});
