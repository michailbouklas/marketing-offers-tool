import { describe, expect, it } from "vitest";
import { makeForecastResult } from "../../../services/forecasts/forecast-fixtures.test-utils";
import {
  buildCompareOutput,
  compactForecast,
  weeklyBuckets,
} from "./forecast-compact";

describe("compactForecast", () => {
  it("drops the history and buckets long horizons into weeks", () => {
    const result = makeForecastResult({ horizonDays: 30, historyDays: 400 });
    const compact = compactForecast(result);

    expect(compact).not.toHaveProperty("history");
    expect(compact.daily).toBeUndefined();
    expect(compact.weekly).toHaveLength(5); // ceil(30 / 7)
    expect(compact.weekly?.map((bucket) => bucket.days)).toEqual([
      7, 7, 7, 7, 2,
    ]);

    const weeklySum =
      compact.weekly?.reduce((sum, bucket) => sum + bucket.total, 0) ?? 0;
    // Weekly totals are rounded per bucket, so allow a few euros of drift.
    expect(Math.abs(weeklySum - compact.summary.horizonTotal)).toBeLessThan(10);
    expect(compact.forecastStart).toBe(result.forecast[0].ds);
    expect(compact.forecastEnd).toBe(result.forecast.at(-1)?.ds);
  });

  it("keeps day-by-day figures with weekday names for short horizons", () => {
    const compact = compactForecast(makeForecastResult({ horizonDays: 14 }));

    expect(compact.weekly).toBeUndefined();
    expect(compact.daily).toHaveLength(14);
    expect(compact.daily?.[0]).toMatchObject({
      ds: "2025-09-14",
      weekday: "Sunday",
    });
    expect(Number.isInteger(compact.daily?.[0].yhat)).toBe(true);
  });

  it("rounds money to euros and percentages to one decimal", () => {
    const result = makeForecastResult({
      summary: {
        ...makeForecastResult().summary,
        horizonTotal: 12_345.678,
        vsLastYearPct: 6.04,
        averageOrderValue: 14.2345,
      },
      accuracy: {
        ...makeForecastResult().accuracy!,
        wapePct: 8.26,
        mae: 411.6,
      },
    });
    const compact = compactForecast(result);

    expect(compact.summary.horizonTotal).toBe(12_346);
    expect(compact.summary.vsLastYearPct).toBe(6);
    expect(compact.summary.averageOrderValue).toBe(14.23);
    expect(compact.accuracy).toMatchObject({ wapePct: 8.3, mae: 412 });
  });

  it("maps warnings to the UI's friendly copy and passes unknown codes through", () => {
    const compact = compactForecast(
      makeForecastResult({
        warnings: [
          { code: "GAPS_FILLED", message: "raw engine text", details: {} },
          { code: "SOMETHING_NEW", message: "engine says hi", details: {} },
        ],
      }),
    );

    expect(compact.warnings).toEqual([
      {
        code: "GAPS_FILLED",
        text: "Some days had no recorded sales and were treated as zero.",
      },
      { code: "SOMETHING_NEW", text: "engine says hi" },
    ]);
  });

  it("pre-writes the narrative sentences and handles a missing accuracy block", () => {
    const compact = compactForecast(
      makeForecastResult({ accuracy: null, cached: true }),
    );

    expect(compact.narrative.headline).toMatch(/^Expected sales for/);
    expect(compact.narrative.confidence).toMatch(/could not measure/);
    expect(compact.narrative.weekday).toMatch(
      /Saturdays are usually the busiest/,
    );
    expect(compact.accuracy).toBeNull();
    expect(compact.cached).toBe(true);
  });

  it("stays small: a 90-day result is under 3 KB of JSON", () => {
    const compact = compactForecast(
      makeForecastResult({ horizonDays: 90, historyDays: 730 }),
    );

    expect(JSON.stringify(compact).length).toBeLessThan(3_000);
  });

  it("omits the series when asked (comparison detail)", () => {
    const compact = compactForecast(makeForecastResult({ horizonDays: 7 }), {
      series: false,
    });

    expect(compact.daily).toBeUndefined();
    expect(compact.weekly).toBeUndefined();
  });
});

describe("weeklyBuckets", () => {
  it("returns no buckets for an empty forecast", () => {
    expect(weeklyBuckets([])).toEqual([]);
  });
});

describe("buildCompareOutput", () => {
  it("builds the compare table, spread, agreement and recommendation", () => {
    const a = makeForecastResult({ modelId: "seasonal_trend" });
    const b = makeForecastResult({
      modelId: "calendar_boost",
      modelName: "Calendar Boost",
      accuracy: { ...a.accuracy!, wapePct: 5, mapePct: 5.5 },
    });

    const compare = buildCompareOutput(
      [a, b],
      [
        {
          modelId: "blend",
          code: "INSUFFICIENT_HISTORY",
          message: "too short",
        },
      ],
    );

    expect(compare.table.map((row) => row.modelId)).toEqual([
      "seasonal_trend",
      "calendar_boost",
    ]);
    expect(compare.table[1]).toMatchObject({ grade: "high", wapePct: 5 });
    expect(compare.spread?.spreadPct).toBe(0);
    expect(compare.agreement).toMatch(/within 1 % of each other/);
    expect(compare.recommendation).toMatch(
      /Calendar Boost has been the most accurate/,
    );
    expect(Object.keys(compare.perModel)).toEqual([
      "seasonal_trend",
      "calendar_boost",
    ]);
    expect(compare.perModel.seasonal_trend.weekly).toBeUndefined();
    expect(compare.failures).toHaveLength(1);
  });

  it("copes with no successful results", () => {
    const compare = buildCompareOutput([], []);

    expect(compare.table).toEqual([]);
    expect(compare.spread).toBeNull();
    expect(compare.agreement).toBeNull();
    expect(compare.recommendation).toBe("No forecasts to compare yet.");
  });
});
