import { describe, expect, it } from "vitest";
import {
  MAX_AXIS_TICKS,
  Y_HEADROOM,
  axisTicks,
  buildChartRows,
  buildCompareBandRows,
  buildCompareRows,
  buildCompareTableRows,
  buildDayRows,
  compareSpread,
  compareYMax,
  csvFileName,
  cutoffAsDate,
  dayRowsToCsv,
  defaultContextDays,
  formatAxisDay,
  formatTooltipDay,
  yMax,
} from "./forecast-chart-data";
import { makeForecastResult } from "./forecast-fixtures.test-utils";

describe("buildChartRows", () => {
  it("shows a context window of actuals followed by the forecast", () => {
    const result = makeForecastResult({ horizonDays: 30, historyDays: 365 });
    const rows = buildChartRows(result);
    expect(defaultContextDays(30)).toBe(60);
    expect(rows).toHaveLength(60 + 30);
    expect(rows[0].actual).not.toBeNull();
    expect(rows[0].forecast).toBeNull();
    expect(rows.at(-1)?.actual).toBeNull();
    expect(rows.at(-1)?.forecast).toBe(result.forecast.at(-1)?.yhat);
    expect(rows.at(-1)?.hi95).toBe(result.forecast.at(-1)?.hi95);
  });

  it("duplicates the last actual into the forecast columns as the seam", () => {
    const result = makeForecastResult();
    const rows = buildChartRows(result);
    const seam = rows.find((row) => row.seam);
    expect(seam?.ds).toBe(result.cutoffDate);
    expect(seam?.forecast).toBe(seam?.actual);
    expect(seam?.lo80).toBe(seam?.actual);
    expect(seam?.hi95).toBe(seam?.actual);
    expect(rows.filter((row) => row.seam)).toHaveLength(1);
  });

  it("keeps at least the minimum context for short horizons and honours overrides", () => {
    expect(defaultContextDays(7)).toBe(28);
    const rows = buildChartRows(makeForecastResult({ horizonDays: 7 }), {
      contextDays: 10,
    });
    expect(rows.filter((row) => row.actual !== null)).toHaveLength(10);
  });

  it("has no seam when there is no history or no forecast", () => {
    const noHistory = buildChartRows(makeForecastResult({ history: [] }));
    expect(noHistory.some((row) => row.seam)).toBe(false);
    const noForecast = buildChartRows(makeForecastResult({ forecast: [] }));
    expect(noForecast.some((row) => row.seam)).toBe(false);
  });

  it("parses dates as UTC midnight", () => {
    const rows = buildChartRows(makeForecastResult());
    expect(rows[0].date.toISOString()).toBe(`${rows[0].ds}T00:00:00.000Z`);
  });
});

describe("yMax", () => {
  it("uses the 80 % band by default and the 95 % band when wide", () => {
    const rows = buildChartRows(makeForecastResult());
    const hi80 = Math.max(
      ...rows.map((row) => row.hi80 ?? 0),
      ...rows.map((row) => row.actual ?? 0),
    );
    const hi95 = Math.max(
      ...rows.map((row) => row.hi95 ?? 0),
      ...rows.map((row) => row.actual ?? 0),
    );
    expect(yMax(rows)).toBeCloseTo(hi80 * Y_HEADROOM, 6);
    expect(yMax(rows, { wide: true })).toBeCloseTo(hi95 * Y_HEADROOM, 6);
    expect(yMax(rows, { wide: true })).toBeGreaterThan(yMax(rows));
  });

  it("never collapses to zero", () => {
    expect(yMax([])).toBe(1);
  });
});

describe("buildCompareRows", () => {
  it("merges actuals and per-model forecasts on the same dates", () => {
    const a = makeForecastResult();
    const b = makeForecastResult({
      modelId: "statistical_baseline",
      forecast: makeForecastResult().forecast.map((point) => ({
        ...point,
        yhat: point.yhat + 500,
      })),
    });
    const rows = buildCompareRows([a, b]);
    expect(rows).toHaveLength(60 + 30);

    const first = rows[0];
    expect(first.actual).not.toBeNull();
    expect(first.models).toEqual({
      seasonal_trend: null,
      statistical_baseline: null,
    });

    const seam = rows.find((row) => row.ds === a.cutoffDate)!;
    expect(seam.models.seasonal_trend).toBe(seam.actual);
    expect(seam.models.statistical_baseline).toBe(seam.actual);

    const last = rows.at(-1)!;
    expect(last.actual).toBeNull();
    expect(last.models.statistical_baseline).toBe(
      (last.models.seasonal_trend ?? 0) + 500,
    );
  });

  it("is sorted by date and returns nothing for no results", () => {
    const rows = buildCompareRows([makeForecastResult()]);
    for (let index = 1; index < rows.length; index += 1) {
      expect(rows[index].date.getTime()).toBeGreaterThan(
        rows[index - 1].date.getTime(),
      );
    }
    expect(buildCompareRows([])).toEqual([]);
  });

  it("computes the compare y max across actuals and every model", () => {
    const a = makeForecastResult();
    const rows = buildCompareRows([a]);
    const max = Math.max(
      ...rows.map((row) => row.actual ?? 0),
      ...rows.map((row) => row.models.seasonal_trend ?? 0),
    );
    expect(compareYMax(rows)).toBeCloseTo(max * Y_HEADROOM, 6);
    expect(compareYMax([])).toBe(1);
  });

  it("exposes a band per model for the optional toggle", () => {
    const a = makeForecastResult();
    const band = buildCompareBandRows(a);
    expect(band).toHaveLength(a.forecast.length);
    expect(band[0]).toMatchObject({
      ds: a.forecast[0].ds,
      lo: a.forecast[0].lo80,
      hi: a.forecast[0].hi80,
    });
  });
});

describe("axis ticks & formatting", () => {
  it("subsamples to at most MAX_AXIS_TICKS, keeping the first date", () => {
    const rows = buildChartRows(
      makeForecastResult({ horizonDays: 90, historyDays: 365 }),
    );
    const ticks = axisTicks(rows);
    expect(ticks.length).toBeLessThanOrEqual(MAX_AXIS_TICKS);
    expect(ticks[0]).toBe(rows[0].date);
    expect(axisTicks([])).toEqual([]);
    expect(axisTicks(rows.slice(0, 3))).toHaveLength(3);
  });

  it("formats axis and tooltip days in UTC", () => {
    const date = new Date("2025-09-13T00:00:00Z");
    expect(formatAxisDay(date)).toBe("13 Sep");
    expect(formatTooltipDay(date)).toBe("Sat 13 Sep 2025");
    expect(cutoffAsDate(makeForecastResult()).toISOString()).toBe(
      "2025-09-13T00:00:00.000Z",
    );
  });
});

describe("day table & CSV", () => {
  it("builds one row per forecast day and flags peak / low", () => {
    const result = makeForecastResult({ horizonDays: 7 });
    const rows = buildDayRows(result);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({
      ds: "2025-09-14",
      label: "Sun 14 Sep",
      weekday: "Sunday",
      isPeak: true,
    });
    expect(rows[1].isLow).toBe(true);
    expect(rows.filter((row) => row.isPeak)).toHaveLength(1);
  });

  it("serialises to CSV with two decimals and a header", () => {
    const result = makeForecastResult({ horizonDays: 2 });
    const csv = dayRowsToCsv(buildDayRows(result));
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe(
      "date,weekday,forecast,likely_low_80,likely_high_80,low_95,high_95",
    );
    expect(lines).toHaveLength(3);
    const first = result.forecast[0];
    expect(lines[1]).toBe(
      `${first.ds},Sunday,${first.yhat.toFixed(2)},${first.lo80.toFixed(2)},${first.hi80.toFixed(2)},${first.lo95.toFixed(2)},${first.hi95.toFixed(2)}`,
    );
    expect(csv.endsWith("\n")).toBe(true);
  });

  it("quotes cells containing commas or quotes", () => {
    const rows = buildDayRows(makeForecastResult({ horizonDays: 1 }));
    rows[0].weekday = 'Sun, "day"';
    expect(dayRowsToCsv(rows).split("\n")[1]).toContain('"Sun, ""day"""');
  });

  it("names the download after brand, model, horizon and cutoff", () => {
    expect(csvFileName(makeForecastResult())).toBe(
      "forecast-bk-seasonal_trend-30d-from-2025-09-13.csv",
    );
    expect(csvFileName(makeForecastResult({ brandAlias: undefined }))).toMatch(
      /^forecast-brand-/,
    );
  });
});

describe("compare table", () => {
  it("flattens the summary per model", () => {
    const a = makeForecastResult();
    const [row] = buildCompareTableRows([a]);
    expect(row).toMatchObject({
      modelId: "seasonal_trend",
      modelName: "Seasonal Trend",
      total: a.summary.horizonTotal,
      vsLastYearPct: 6,
      vsTrailingPct: 3,
      typicalMissPct: 9.1,
    });
  });

  it("computes the spread row", () => {
    const a = makeForecastResult();
    const b = makeForecastResult({
      modelId: "statistical_baseline",
      summary: { ...a.summary, horizonTotal: a.summary.horizonTotal * 1.1 },
    });
    const spread = compareSpread([a, b])!;
    expect(spread.minTotal).toBe(a.summary.horizonTotal);
    expect(spread.maxTotal).toBeCloseTo(a.summary.horizonTotal * 1.1, 6);
    expect(spread.spreadPct).toBeCloseTo((0.1 / 1.05) * 100, 6);
    expect(compareSpread([a])).toBeNull();
  });
});
