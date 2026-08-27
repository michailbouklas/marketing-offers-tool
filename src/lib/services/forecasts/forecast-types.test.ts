import { describe, expect, it } from "vitest";
import {
  buildForecastHref,
  defaultForecastModelIds,
  forecastHistoryRequestSchema,
  forecastRunRequestSchema,
  modelColorIndex,
  modelStroke,
  parseForecastFilters,
  type ForecastModel,
} from "./forecast-types";

const catalog: ForecastModel[] = [
  {
    id: "seasonal_trend",
    name: "Seasonal Trend",
    description: "",
    version: "1",
    minHistoryDays: 56,
    recommendedHorizons: [7, 14, 30, 90],
    supportsHolidays: true,
  },
  {
    id: "statistical_baseline",
    name: "Statistical Baseline",
    description: "",
    version: "1",
    minHistoryDays: 56,
    recommendedHorizons: [7, 14, 30],
    supportsHolidays: false,
  },
  {
    id: "seasonal_naive",
    name: "Seasonal Naive",
    description: "",
    version: "1",
    minHistoryDays: 14,
    recommendedHorizons: [7],
    supportsHolidays: false,
  },
];

describe("parseForecastFilters", () => {
  it("defaults to the first two catalog models and the default horizon", () => {
    const filters = parseForecastFilters(new URLSearchParams(), catalog);

    expect(filters).toEqual({
      brand: null,
      models: ["seasonal_trend", "statistical_baseline"],
      horizon: 30,
    });
    expect(defaultForecastModelIds(catalog)).toEqual([
      "seasonal_trend",
      "statistical_baseline",
    ]);
  });

  it("trims and lowercases the brand alias without validating it", () => {
    const filters = parseForecastFilters(
      new URLSearchParams("brand=%20BK%20"),
      catalog,
    );

    expect(filters.brand).toBe("bk");
  });

  it("drops unknown model ids and re-orders the rest to catalog order", () => {
    const filters = parseForecastFilters(
      new URLSearchParams(
        "models=seasonal_naive,made_up,%20seasonal_trend%20,seasonal_naive",
      ),
      catalog,
    );

    expect(filters.models).toEqual(["seasonal_trend", "seasonal_naive"]);
  });

  it("selects no models when the param is present but only unknown ids", () => {
    const filters = parseForecastFilters(
      new URLSearchParams("models=nope"),
      catalog,
    );

    expect(filters.models).toEqual([]);
  });

  it("falls back to the default horizon for unsupported values", () => {
    expect(
      parseForecastFilters(new URLSearchParams("horizon=45"), catalog).horizon,
    ).toBe(30);
    expect(
      parseForecastFilters(new URLSearchParams("horizon=abc"), catalog).horizon,
    ).toBe(30);
    expect(
      parseForecastFilters(new URLSearchParams("horizon=90"), catalog).horizon,
    ).toBe(90);
  });
});

describe("buildForecastHref", () => {
  it("omits defaults so URLs stay short", () => {
    const href = buildForecastHref(
      "/forecasts",
      {
        brand: "bk",
        models: ["seasonal_trend", "statistical_baseline"],
        horizon: 30,
      },
      catalog,
    );

    expect(href).toBe("/forecasts?brand=bk");
  });

  it("returns the bare path when nothing is set", () => {
    expect(
      buildForecastHref(
        "/forecasts/compare",
        { brand: null, models: defaultForecastModelIds(catalog), horizon: 30 },
        catalog,
      ),
    ).toBe("/forecasts/compare");
  });

  it("round-trips through parseForecastFilters", () => {
    const filters = {
      brand: "kfc",
      models: ["statistical_baseline", "seasonal_naive"],
      horizon: 90 as const,
    };
    const href = buildForecastHref("/forecasts", filters, catalog);
    const url = new URL(href, "http://test.local");

    expect(href).toBe(
      "/forecasts?brand=kfc&models=statistical_baseline%2Cseasonal_naive&horizon=90",
    );
    expect(parseForecastFilters(url.searchParams, catalog)).toEqual(filters);
  });

  it("encodes an explicit empty model selection", () => {
    const href = buildForecastHref(
      "/forecasts",
      { brand: "bk", models: [], horizon: 30 },
      catalog,
    );
    const url = new URL(href, "http://test.local");

    expect(url.searchParams.get("models")).toBe("");
    expect(parseForecastFilters(url.searchParams, catalog).models).toEqual([]);
  });
});

describe("model visual identity", () => {
  it("uses the catalog index and falls back to 0 for unknown ids", () => {
    expect(modelColorIndex("statistical_baseline", catalog)).toBe(1);
    expect(modelColorIndex("unknown", catalog)).toBe(0);
  });

  it("cycles colours from --chart-2 and always pairs a dash pattern", () => {
    expect(modelStroke(0)).toEqual({ color: "var(--chart-2)", dash: "" });
    expect(modelStroke(1)).toEqual({ color: "var(--chart-3)", dash: "6 3" });
    expect(modelStroke(4)).toEqual({ color: "var(--chart-2)", dash: "" });
    expect(modelStroke(-3).color).toBe("var(--chart-2)");
  });
});

describe("request schemas", () => {
  it("accepts only the supported horizons", () => {
    expect(
      forecastRunRequestSchema.safeParse({
        brandAlias: " bk ",
        modelId: "seasonal_trend",
        horizonDays: 14,
      }),
    ).toMatchObject({
      success: true,
      data: { brandAlias: "bk", horizonDays: 14 },
    });
    expect(
      forecastRunRequestSchema.safeParse({
        brandAlias: "bk",
        modelId: "seasonal_trend",
        horizonDays: 45,
      }).success,
    ).toBe(false);
  });

  it("coerces and bounds the history days", () => {
    expect(
      forecastHistoryRequestSchema.parse({ brand: "bk", days: "120" }),
    ).toEqual({ brand: "bk", days: 120 });
    expect(forecastHistoryRequestSchema.parse({ brand: "bk" }).days).toBe(90);
    expect(
      forecastHistoryRequestSchema.safeParse({ brand: "bk", days: "3" })
        .success,
    ).toBe(false);
    expect(forecastHistoryRequestSchema.safeParse({ days: "30" }).success).toBe(
      false,
    );
  });
});
