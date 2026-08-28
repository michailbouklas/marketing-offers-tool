import { RequestContext } from "@mastra/core/request-context";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fixtureCatalog,
  makeForecastResult,
} from "../../../services/forecasts/forecast-fixtures.test-utils";
import {
  BRAND_SCOPE_NAMES_RUNTIME_KEY,
  BRAND_SCOPE_RUNTIME_KEY,
} from "../chat-registry";
import type { CompactCompare, CompactForecast } from "./forecast-compact";
import {
  setForecastGateway,
  type ForecastGateway,
  type GatewayOutcome,
} from "./forecast-gateway";
import {
  authorizeBrand,
  COMPARE_CONCURRENCY,
  COMPARE_MAX_MODELS,
  compareForecastModels,
  getForecastSummary,
  getForecastSummaryInputSchema,
  getSalesHistoryCoverage,
  listForecastModels,
  mapWithConcurrency,
  REFUSAL_SENTENCE,
  resolveLocation,
} from "./forecast-tools";

const catalog = [
  ...fixtureCatalog,
  {
    id: "calendar_boost",
    name: "Calendar Boost",
    description: "",
    version: "1.0",
    minHistoryDays: 120,
    recommendedHorizons: [7, 14, 30],
    supportsHolidays: true,
  },
  {
    id: "blend",
    name: "Blend",
    description: "",
    version: "1.0",
    minHistoryDays: 120,
    recommendedHorizons: [7, 14, 30, 90],
    supportsHolidays: true,
  },
];

const ok = <T>(value: T): GatewayOutcome<T> => ({ ok: true, value });

function fakeGateway(overrides: Partial<ForecastGateway> = {}) {
  const gateway: ForecastGateway = {
    listModels: vi.fn(async () => ok(catalog)),
    listLocations: vi.fn(async () =>
      ok([
        { id: 3, name: "Limassol Marina" },
        { id: 7, name: "Limassol Old Port" },
        { id: 9, name: "Nicosia Mall" },
      ]),
    ),
    getBrandCoverage: vi.fn(async () =>
      ok({ latestSalesDate: "2026-08-27", historyDays: 100 }),
    ),
    getLocationCoverage: vi.fn(async () =>
      ok([
        {
          id: 3,
          name: "Limassol Marina",
          firstSalesDate: "2024-01-01",
          latestSalesDate: "2026-08-27",
          daysWithSales: 900,
        },
        {
          id: 9,
          name: "Nicosia Mall",
          firstSalesDate: "2026-06-01",
          latestSalesDate: "2026-08-27",
          daysWithSales: 80,
        },
      ]),
    ),
    runForecast: vi.fn(async (input) =>
      ok(
        makeForecastResult({
          modelId: input.modelId,
          modelName: catalog.find((m) => m.id === input.modelId)?.name,
          brandAlias: input.brandAlias,
          horizonDays: input.horizonDays,
          locationId: input.locationId,
          locationName: input.locationName,
        }),
      ),
    ),
    ...overrides,
  };
  setForecastGateway(gateway);
  return gateway;
}

function scoped(aliases: string[] = ["bk", "kfc"], names?: string[]) {
  const requestContext = new RequestContext();
  requestContext.set(BRAND_SCOPE_RUNTIME_KEY, aliases);
  requestContext.set(
    BRAND_SCOPE_NAMES_RUNTIME_KEY,
    names ?? aliases.map((alias) => alias.toUpperCase()),
  );
  return { requestContext };
}

/** Direct `execute` calls bypass Mastra's runtime typing of the context. */
function ctx(value: { requestContext?: RequestContext }) {
  return value as never;
}

// Mastra types `execute` as returning `unknown`; these are the shapes the
// tools actually return (see forecast-tools.ts).
type Failure = { ok: false; code: string; error: string; retryable?: boolean };
type SummaryOk = { ok: true; forecast: CompactForecast };
type CompareOk = { ok: true; compare: CompactCompare };
type CoverageOk = {
  ok: true;
  brandAlias: string;
  latestSalesDate: string | null;
  historyDays: number;
  eligibleModels: { id: string; name: string; minHistoryDays: number }[];
  ineligibleModels: {
    id: string;
    name: string;
    needsDays: number;
    shortBy: number;
  }[];
  note: string | null;
  locationCount?: number;
  locationsTruncated?: boolean;
  locations?: { id: number; eligibleModelIds: string[] }[];
};

async function call<T>(promise: Promise<unknown>): Promise<T | Failure> {
  return (await promise) as T | Failure;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  setForecastGateway(null);
});

describe("authorizeBrand", () => {
  it("fails closed when no scope was published", () => {
    const result = authorizeBrand("bk", undefined);
    expect(result).toMatchObject({ ok: false, code: "SCOPE_MISSING" });
  });

  it("refuses when the user has no brands", () => {
    const result = authorizeBrand("bk", scoped([]).requestContext);
    expect(result).toMatchObject({ ok: false, code: "NO_BRANDS" });
  });

  it("refuses an alias outside the scope with the exact refusal sentence", () => {
    const result = authorizeBrand("phcy", scoped().requestContext);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FORBIDDEN");
      expect(result.error.endsWith(REFUSAL_SENTENCE)).toBe(true);
    }
  });

  it("matches aliases case-insensitively and returns the display name", () => {
    const result = authorizeBrand(" KFC ", scoped().requestContext);
    expect(result).toEqual({ ok: true, brand: { alias: "kfc", name: "KFC" } });
  });
});

describe("gateway not installed", () => {
  it("fails closed without calling anything", async () => {
    const result = await call<SummaryOk>(
      getForecastSummary.execute!(
        { brandAlias: "bk", modelId: "blend", horizonDays: 30 },
        ctx(scoped()),
      ),
    );
    expect(result).toMatchObject({ ok: false, code: "GATEWAY_UNAVAILABLE" });
  });

  it("listForecastModels reports the same failure", async () => {
    const result = await call<{ ok: true }>(
      listForecastModels.execute!({}, ctx({})),
    );
    expect(result).toMatchObject({ ok: false, code: "GATEWAY_UNAVAILABLE" });
  });
});

describe("getForecastSummary", () => {
  it("never reaches the gateway for an out-of-scope brand", async () => {
    const gateway = fakeGateway();
    const result = await call<SummaryOk>(
      getForecastSummary.execute!(
        { brandAlias: "phcy", modelId: "blend", horizonDays: 30 },
        ctx(scoped()),
      ),
    );
    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(gateway.runForecast).not.toHaveBeenCalled();
    expect(gateway.listModels).not.toHaveBeenCalled();
  });

  it("rejects an unknown model and lists the catalog ids", async () => {
    const gateway = fakeGateway();
    const result = await call<SummaryOk>(
      getForecastSummary.execute!(
        { brandAlias: "bk", modelId: "prophet", horizonDays: 30 },
        ctx(scoped()),
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("UNKNOWN_MODEL");
      expect(result.error).toContain("seasonal_trend");
      expect(result.error).toContain("blend");
    }
    expect(gateway.runForecast).not.toHaveBeenCalled();
  });

  it("runs the model with the scoped brand and returns a compact forecast", async () => {
    const gateway = fakeGateway();
    const result = await call<SummaryOk>(
      getForecastSummary.execute!(
        { brandAlias: "bk", modelId: "blend", horizonDays: 30 },
        ctx(scoped()),
      ),
    );

    expect(gateway.runForecast).toHaveBeenCalledWith({
      brandAlias: "bk",
      brandName: "BK",
      modelId: "blend",
      horizonDays: 30,
      locationId: null,
      locationName: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.forecast.modelId).toBe("blend");
      expect(result.forecast.weekly).toHaveLength(5);
      expect(result.forecast).not.toHaveProperty("history");
    }
  });

  it("resolves a store by name and forwards its id", async () => {
    const gateway = fakeGateway();
    const result = await call<SummaryOk>(
      getForecastSummary.execute!(
        {
          brandAlias: "bk",
          modelId: "seasonal_trend",
          horizonDays: 7,
          locationName: "nicosia",
        },
        ctx(scoped()),
      ),
    );

    expect(result.ok).toBe(true);
    expect(gateway.runForecast).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: 9, locationName: "Nicosia Mall" }),
    );
  });

  it("translates gateway failures into tool failures with a hint", async () => {
    const gateway = fakeGateway({
      runForecast: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: "INSUFFICIENT_HISTORY",
          message: "BK has 41 days of sales history; Blend needs at least 120.",
          retryable: false,
        },
      })),
    });
    const result = await call<SummaryOk>(
      getForecastSummary.execute!(
        { brandAlias: "bk", modelId: "blend", horizonDays: 30 },
        ctx(scoped()),
      ),
    );

    expect(gateway.runForecast).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INSUFFICIENT_HISTORY");
      expect(result.error).toContain("41 days");
      expect(result.error).toContain("lower minimum");
    }
  });

  it("only accepts the page's horizons in its schema", () => {
    expect(
      getForecastSummaryInputSchema.safeParse({
        brandAlias: "bk",
        horizonDays: 10,
      }).success,
    ).toBe(false);
    const parsed = getForecastSummaryInputSchema.safeParse({
      brandAlias: "bk",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toMatchObject({ modelId: "blend", horizonDays: 30 });
    }
  });
});

describe("resolveLocation", () => {
  it("returns null (all stores) when nothing was requested", async () => {
    const gateway = fakeGateway();
    await expect(resolveLocation(gateway, "bk", {})).resolves.toEqual({
      ok: true,
      location: null,
    });
    expect(gateway.listLocations).not.toHaveBeenCalled();
  });

  it("reports ambiguous name fragments with the candidates", async () => {
    const gateway = fakeGateway();
    const result = await resolveLocation(gateway, "bk", {
      locationName: "Limassol",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AMBIGUOUS_LOCATION");
      expect(result.error).toContain("Limassol Marina (id 3)");
      expect(result.error).toContain("Limassol Old Port (id 7)");
    }
  });

  it("rejects an id that does not belong to the brand", async () => {
    const gateway = fakeGateway();
    const result = await resolveLocation(gateway, "bk", { locationId: 42 });
    expect(result).toMatchObject({ ok: false, code: "UNKNOWN_LOCATION" });
  });

  it("accepts a known id", async () => {
    const gateway = fakeGateway();
    await expect(
      resolveLocation(gateway, "bk", { locationId: 7 }),
    ).resolves.toEqual({
      ok: true,
      location: { id: 7, name: "Limassol Old Port" },
    });
  });
});

describe("getSalesHistoryCoverage", () => {
  it("splits the catalog into eligible and ineligible models", async () => {
    fakeGateway();
    const result = await call<CoverageOk>(
      getSalesHistoryCoverage.execute!(
        { brandAlias: "bk", perLocation: false },
        ctx(scoped()),
      ),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.historyDays).toBe(100);
      expect(result.eligibleModels.map((m) => m.id)).toEqual([
        "seasonal_trend",
        "statistical_baseline",
      ]);
      expect(result.ineligibleModels).toEqual([
        {
          id: "calendar_boost",
          name: "Calendar Boost",
          needsDays: 120,
          shortBy: 20,
        },
        { id: "blend", name: "Blend", needsDays: 120, shortBy: 20 },
      ]);
      expect(result.locations).toBeUndefined();
    }
  });

  it("adds per-store coverage sorted by history when asked", async () => {
    const gateway = fakeGateway();
    const result = await call<CoverageOk>(
      getSalesHistoryCoverage.execute!(
        { brandAlias: "bk", perLocation: true },
        ctx(scoped()),
      ),
    );

    expect(gateway.getLocationCoverage).toHaveBeenCalledWith("bk");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.locations?.map((l) => l.id)).toEqual([3, 9]);
      expect(result.locations?.[0].eligibleModelIds).toContain(
        "calendar_boost",
      );
      expect(result.locations?.[1].eligibleModelIds).toEqual([
        "seasonal_trend",
        "statistical_baseline",
      ]);
      expect(result.locationsTruncated).toBe(false);
    }
  });

  it("explains a brand with no sales at all", async () => {
    fakeGateway({ getBrandCoverage: vi.fn(async () => ok(null)) });
    const result = await call<CoverageOk>(
      getSalesHistoryCoverage.execute!(
        { brandAlias: "bk", perLocation: false },
        ctx(scoped()),
      ),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.historyDays).toBe(0);
      expect(result.latestSalesDate).toBeNull();
      expect(result.note).toMatch(/nothing to forecast/);
    }
  });
});

describe("compareForecastModels", () => {
  it("defaults to every model except blend (max three) and dedupes ids", async () => {
    const gateway = fakeGateway();
    const result = await call<CompareOk>(
      compareForecastModels.execute!(
        { brandAlias: "bk", horizonDays: 30 },
        ctx(scoped()),
      ),
    );

    const ran = vi
      .mocked(gateway.runForecast)
      .mock.calls.map(([input]) => input.modelId);
    expect(ran).toEqual([
      "seasonal_trend",
      "statistical_baseline",
      "calendar_boost",
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.compare.table).toHaveLength(3);
      expect(result.compare.failures).toEqual([]);
      expect(result.compare.recommendation.length).toBeGreaterThan(0);
    }

    vi.mocked(gateway.runForecast).mockClear();
    await compareForecastModels.execute!(
      { brandAlias: "bk", horizonDays: 30, modelIds: ["blend", "blend"] },
      ctx(scoped()),
    );
    expect(gateway.runForecast).toHaveBeenCalledTimes(1);
  });

  it("caps the run at COMPARE_MAX_MODELS and reports unknown ids as failures", async () => {
    const gateway = fakeGateway();
    const result = await call<CompareOk>(
      compareForecastModels.execute!(
        {
          brandAlias: "bk",
          horizonDays: 14,
          modelIds: [
            "seasonal_trend",
            "statistical_baseline",
            "calendar_boost",
            "blend",
            "nope",
          ],
        },
        ctx(scoped()),
      ),
    );

    expect(gateway.runForecast).toHaveBeenCalledTimes(COMPARE_MAX_MODELS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.compare.failures).toEqual([
        expect.objectContaining({ modelId: "nope", code: "UNKNOWN_MODEL" }),
      ]);
    }
  });

  it("never runs more than COMPARE_CONCURRENCY forecasts at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const gateway = fakeGateway({
      runForecast: vi.fn(async (input) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return ok(makeForecastResult({ modelId: input.modelId }));
      }),
    });

    await compareForecastModels.execute!(
      {
        brandAlias: "bk",
        horizonDays: 30,
        modelIds: [
          "seasonal_trend",
          "statistical_baseline",
          "calendar_boost",
          "blend",
        ],
      },
      ctx(scoped()),
    );

    expect(gateway.runForecast).toHaveBeenCalledTimes(4);
    expect(peak).toBeLessThanOrEqual(COMPARE_CONCURRENCY);
    expect(peak).toBeGreaterThan(0);
  });

  it("keeps comparing when one model fails and still recommends", async () => {
    fakeGateway({
      runForecast: vi.fn(async (input) =>
        input.modelId === "calendar_boost"
          ? {
              ok: false as const,
              error: {
                code: "INSUFFICIENT_HISTORY",
                message: "needs 120 days",
                retryable: false,
              },
            }
          : ok(makeForecastResult({ modelId: input.modelId })),
      ),
    });

    const result = await call<CompareOk>(
      compareForecastModels.execute!(
        { brandAlias: "bk", horizonDays: 30 },
        ctx(scoped()),
      ),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.compare.table.map((row) => row.modelId)).toEqual([
        "seasonal_trend",
        "statistical_baseline",
      ]);
      expect(result.compare.failures).toEqual([
        {
          modelId: "calendar_boost",
          code: "INSUFFICIENT_HISTORY",
          message: "needs 120 days",
        },
      ]);
      expect(result.compare.recommendation).not.toBe(
        "No forecasts to compare yet.",
      );
    }
  });

  it("fails when every model fails", async () => {
    fakeGateway({
      runForecast: vi.fn(async () => ({
        ok: false as const,
        error: { code: "ENGINE_UNAVAILABLE", message: "down", retryable: true },
      })),
    });

    const result = await call<CompareOk>(
      compareForecastModels.execute!(
        {
          brandAlias: "bk",
          horizonDays: 30,
          modelIds: ["blend", "calendar_boost"],
        },
        ctx(scoped()),
      ),
    );

    expect(result).toMatchObject({
      ok: false,
      code: "ENGINE_UNAVAILABLE",
      retryable: true,
    });
  });

  it("refuses out-of-scope brands before doing any work", async () => {
    const gateway = fakeGateway();
    const result = await call<CompareOk>(
      compareForecastModels.execute!(
        { brandAlias: "phcy", horizonDays: 30 },
        ctx(scoped()),
      ),
    );
    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(gateway.listModels).not.toHaveBeenCalled();
  });
});

describe("mapWithConcurrency", () => {
  it("preserves order and bounds parallelism", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 6 - n));
      inFlight -= 1;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });

  it("handles an empty list", async () => {
    await expect(mapWithConcurrency([], 3, async () => 1)).resolves.toEqual([]);
  });
});
