import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  buildForecastValidationHref,
  compareForecastToActuals,
  daysBetweenIso,
  defaultForecastValidationFilters,
  forecastModelName,
  forecastValidationWindow,
  formatPct,
  gradeForWape,
  groupValidationRuns,
  parseForecastValidationFilters,
  summarizeValidationRuns,
  validationMatrix,
  type ForecastValidationMetricRow,
} from "./forecast-validation";

describe("gradeForWape", () => {
  it("uses the engine thresholds (12 / 25) inclusively", () => {
    expect(gradeForWape(0)).toBe("high");
    expect(gradeForWape(12)).toBe("high");
    expect(gradeForWape(12.01)).toBe("medium");
    expect(gradeForWape(25)).toBe("medium");
    expect(gradeForWape(25.01)).toBe("low");
  });
});

describe("date helpers", () => {
  it("adds calendar days across month and year ends", () => {
    expect(addDaysIso("2026-10-08", 1)).toBe("2026-10-09");
    expect(addDaysIso("2026-12-30", 7)).toBe("2027-01-06");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts days between dates in either direction", () => {
    expect(daysBetweenIso("2026-10-01", "2026-10-08")).toBe(7);
    expect(daysBetweenIso("2026-10-08", "2026-10-01")).toBe(-7);
  });

  it("rejects malformed dates", () => {
    expect(() => addDaysIso("2026/10/08", 1)).toThrow(/ISO date/);
  });
});

describe("forecastValidationWindow", () => {
  it("covers cutoff+1 .. cutoff+horizon and evaluates on the last day", () => {
    expect(forecastValidationWindow("2026-10-07", 7)).toEqual({
      from: "2026-10-08",
      to: "2026-10-14",
      evaluateAfter: "2026-10-14",
    });
  });

  it("rejects a non-positive horizon", () => {
    expect(() => forecastValidationWindow("2026-10-07", 0)).toThrow(
      /positive integer/,
    );
  });
});

describe("compareForecastToActuals", () => {
  const points = [
    { ds: "2026-10-08", yhat: 100, lo80: 90, hi80: 110 },
    { ds: "2026-10-09", yhat: 100, lo80: 90, hi80: 110 },
    { ds: "2026-10-10", yhat: 100, lo80: 90, hi80: 110 },
    { ds: "2026-10-11", yhat: 100, lo80: 90, hi80: 110 },
  ];

  it("computes totals, deviation, WAPE, bias, coverage and quality", () => {
    const result = compareForecastToActuals(points, [
      { ds: "2026-10-08", revenue: 110 }, // err -10, inside band
      { ds: "2026-10-09", revenue: 95 }, // err +5, inside band
      { ds: "2026-10-10", revenue: 80 }, // err +20, below band
      { ds: "2026-10-11", revenue: 115 }, // err -15, above band
    ]);

    expect(result.forecastTotal).toBe(400);
    expect(result.actualTotal).toBe(400);
    expect(result.actualDays).toBe(4);
    expect(result.deviation).toBe(0);
    expect(result.deviationPct).toBe(0);
    // Σ|err| = 50 over Σ|y| = 400
    expect(result.wapePct).toBe(12.5);
    // Σerr = 0
    expect(result.biasPct).toBe(0);
    expect(result.coverage80Pct).toBe(50);
    expect(result.quality).toBe("medium");
    expect(result.points.map((point) => point.actual)).toEqual([
      110, 95, 80, 115,
    ]);
  });

  it("treats days without a sales row as zero and reports them via actualDays", () => {
    const result = compareForecastToActuals(points, [
      { ds: "2026-10-08", revenue: 100 },
      { ds: "2026-10-09", revenue: 100 },
    ]);

    expect(result.actualTotal).toBe(200);
    expect(result.actualDays).toBe(2);
    expect(result.deviation).toBe(-200);
    expect(result.deviationPct).toBe(-100);
    expect(result.wapePct).toBe(100);
    expect(result.biasPct).toBe(100);
    expect(result.quality).toBe("low");
    expect(result.points[2]).toMatchObject({ actual: 0, hasActual: false });
  });

  it("ignores actuals outside the forecast window", () => {
    const result = compareForecastToActuals(points.slice(0, 1), [
      { ds: "2026-10-08", revenue: 100 },
      { ds: "2026-10-20", revenue: 9999 },
    ]);

    expect(result.actualTotal).toBe(100);
    expect(result.wapePct).toBe(0);
    expect(result.quality).toBe("high");
  });

  it("returns null metrics when the window had no sales at all", () => {
    const result = compareForecastToActuals(points, []);

    expect(result.actualTotal).toBe(0);
    expect(result.actualDays).toBe(0);
    expect(result.deviation).toBe(-400);
    expect(result.deviationPct).toBeNull();
    expect(result.wapePct).toBeNull();
    expect(result.biasPct).toBeNull();
    expect(result.coverage80Pct).toBe(0);
    expect(result.quality).toBeNull();
  });

  it("returns null coverage for an empty forecast", () => {
    const result = compareForecastToActuals([], []);

    expect(result.coverage80Pct).toBeNull();
    expect(result.points).toEqual([]);
  });
});

describe("parseForecastValidationFilters / buildForecastValidationHref", () => {
  it("returns defaults for an empty query", () => {
    expect(parseForecastValidationFilters(new URLSearchParams())).toEqual(
      defaultForecastValidationFilters,
    );
  });

  it("parses every filter and lowercases the brand", () => {
    const filters = parseForecastValidationFilters(
      new URLSearchParams(
        "brand=BK&model=blend&horizon=14&status=evaluated&quality=low&batch=abc-123&group=brand&page=3&sort=wape&dir=desc",
      ),
    );
    expect(filters).toEqual({
      brand: "bk",
      model: "blend",
      horizon: 14,
      status: "evaluated",
      quality: "low",
      batch: "abc-123",
      group: "brand",
      page: 3,
      sort: "wape",
      dir: "desc",
    });
  });

  it("drops bad values field by field", () => {
    const filters = parseForecastValidationFilters(
      new URLSearchParams(
        "horizon=400&status=nope&quality=great&batch=not%20a%20batch!&group=x&page=-2&sort=colour&dir=sideways",
      ),
    );
    expect(filters).toEqual(defaultForecastValidationFilters);
  });

  it("defaults the direction per sort field", () => {
    expect(
      parseForecastValidationFilters(new URLSearchParams("sort=wape")).dir,
    ).toBe("asc");
    expect(
      parseForecastValidationFilters(new URLSearchParams("sort=cutoff")).dir,
    ).toBe("desc");
  });

  it("round-trips through the href builder and omits defaults", () => {
    expect(
      buildForecastValidationHref(
        "/forecasts/validation",
        defaultForecastValidationFilters,
      ),
    ).toBe("/forecasts/validation");

    const filters = {
      ...defaultForecastValidationFilters,
      brand: "bk",
      sort: "wape" as const,
      dir: "desc" as const,
      page: 2,
    };
    const href = buildForecastValidationHref("/forecasts/validation", filters);
    expect(href).toBe(
      "/forecasts/validation?brand=bk&sort=wape&dir=desc&page=2",
    );
    expect(
      parseForecastValidationFilters(new URL(href, "http://x").searchParams),
    ).toEqual(filters);
  });
});

describe("aggregations", () => {
  const catalog = [
    { id: "seasonal_trend", name: "Seasonal Trend" },
    { id: "blend", name: "Blend" },
  ];

  function row(
    overrides: Partial<ForecastValidationMetricRow>,
  ): ForecastValidationMetricRow {
    return {
      status: "evaluated",
      quality: "high",
      wapePct: 10,
      deviationPct: -5,
      biasPct: 5,
      coverage80Pct: 80,
      evaluateAfter: "2026-10-14",
      cutoffDate: "2026-10-07",
      brandAlias: "bk",
      brandName: "Burger King",
      modelId: "seasonal_trend",
      horizonDays: 7,
      batchId: "batch-1",
      ...overrides,
    };
  }

  const rows: ForecastValidationMetricRow[] = [
    row({ modelId: "seasonal_trend", wapePct: 10, deviationPct: -5 }),
    row({
      modelId: "blend",
      wapePct: 30,
      deviationPct: 20,
      biasPct: -20,
      quality: "low",
      coverage80Pct: 40,
    }),
    row({
      brandAlias: "kfc",
      brandName: "KFC",
      modelId: "blend",
      wapePct: 14,
      deviationPct: 10,
      quality: "medium",
    }),
    row({
      brandAlias: "kfc",
      brandName: "KFC",
      modelId: "seasonal_trend",
      status: "pending",
      quality: null,
      wapePct: null,
      deviationPct: null,
      biasPct: null,
      coverage80Pct: null,
      evaluateAfter: "2026-10-20",
      batchId: "batch-2",
      cutoffDate: "2026-10-13",
    }),
    row({
      brandAlias: "paul",
      brandName: "Paul",
      status: "skipped",
      quality: null,
      wapePct: null,
      deviationPct: null,
      biasPct: null,
      coverage80Pct: null,
      evaluateAfter: "2026-10-15",
    }),
  ];

  it("summarises counts and means over evaluated runs only", () => {
    const summary = summarizeValidationRuns(rows);
    expect(summary).toMatchObject({
      total: 5,
      pending: 1,
      evaluated: 3,
      skipped: 1,
      failed: 0,
      nextDue: "2026-10-20",
      meanWapePct: 18,
      meanAbsDeviationPct: 11.7,
      meanBiasPct: -3.3,
      meanCoverage80Pct: 66.7,
      qualityCounts: { high: 1, medium: 1, low: 1 },
    });
  });

  it("returns null means when nothing is evaluated", () => {
    const summary = summarizeValidationRuns(rows.slice(3));
    expect(summary.meanWapePct).toBeNull();
    expect(summary.qualityCounts).toEqual({ high: 0, medium: 0, low: 0 });
  });

  it("groups by model, best WAPE first", () => {
    const groups = groupValidationRuns(rows, "model", catalog);
    expect(
      groups.map((group) => [group.key, group.label, group.meanWapePct]),
    ).toEqual([
      ["seasonal_trend", "Seasonal Trend", 10],
      ["blend", "Blend", 22],
    ]);
    expect(groups[0]).toMatchObject({
      runs: 3,
      evaluated: 1,
      pending: 1,
      bestModelId: null,
    });
  });

  it("groups by brand with the best model per brand and unscored brands last", () => {
    const groups = groupValidationRuns(rows, "brand", catalog);
    expect(groups.map((group) => group.label)).toEqual([
      "KFC",
      "Burger King",
      "Paul",
    ]);
    expect(groups[0]).toMatchObject({
      key: "kfc",
      meanWapePct: 14,
      bestModelId: "blend",
      bestModelWapePct: 14,
    });
    expect(groups[1]).toMatchObject({
      meanWapePct: 20,
      bestModelId: "seasonal_trend",
      bestModelWapePct: 10,
    });
    expect(groups[2]).toMatchObject({ evaluated: 0, meanWapePct: null });
  });

  it("labels horizon and batch groups", () => {
    expect(groupValidationRuns(rows, "horizon", catalog)[0].label).toBe(
      "7 days",
    );
    const batches = groupValidationRuns(rows, "batch", catalog);
    expect(batches.map((group) => group.label)).toEqual([
      "2026-10-07 - batch-1",
      "2026-10-13 - batch-2",
    ]);
  });

  it("builds the brand by model matrix in catalog order", () => {
    const matrix = validationMatrix(rows, catalog);
    expect(matrix.models.map((model) => model.id)).toEqual([
      "seasonal_trend",
      "blend",
    ]);
    expect(matrix.brands.map((brand) => brand.alias)).toEqual([
      "bk",
      "kfc",
      "paul",
    ]);
    expect(matrix.cells.bk.seasonal_trend).toEqual({
      meanWapePct: 10,
      evaluated: 1,
      quality: "high",
    });
    expect(matrix.cells.bk.blend).toEqual({
      meanWapePct: 30,
      evaluated: 1,
      quality: "low",
    });
    expect(matrix.cells.kfc.seasonal_trend).toEqual({
      meanWapePct: null,
      evaluated: 0,
      quality: null,
    });
    expect(matrix.bestModelByBrand).toEqual({
      bk: "seasonal_trend",
      kfc: "blend",
      paul: null,
    });
  });

  it("keeps unknown model ids with their id as the name", () => {
    const matrix = validationMatrix([row({ modelId: "mystery" })], catalog);
    expect(matrix.models).toEqual([{ id: "mystery", name: "mystery" }]);
    expect(forecastModelName("mystery", catalog)).toBe("mystery");
  });
});

describe("formatPct", () => {
  it("formats with one decimal and a dash for missing values", () => {
    expect(formatPct(12.345)).toBe("12.3 %");
    expect(formatPct(50, 0)).toBe("50 %");
    expect(formatPct(null)).toBe("—");
    expect(formatPct(Number.NaN)).toBe("—");
  });
});
