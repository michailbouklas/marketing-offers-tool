import { describe, expect, it } from "vitest";
import { makeForecastResult } from "./forecast-fixtures.test-utils";
import {
  agreementSentence,
  analystMetrics,
  analystSummaryLine,
  cardStatusSentence,
  compareRecommendation,
  comparisonWord,
  confidenceLabel,
  confidenceSentence,
  describeComputedAge,
  forecastErrorCopy,
  forecastWarningCopy,
  formatAboutPct,
  formatCompactMoney,
  formatDayLabel,
  formatMoney,
  formatSignedPct,
  headlineParts,
  headlineSentence,
  horizonPhrase,
  insufficientHistorySentence,
  kpiTiles,
  minHistoryBadge,
  seasonalityChips,
  spreadPct,
  trailingPhrase,
  trendSentence,
  typicalMissPct,
  weekdayName,
  weekdayNote,
} from "./forecast-narrative";

describe("formatCompactMoney", () => {
  it("follows the €980 / €9,850 / €41.2k / €412k / €1.2M ladder", () => {
    expect(formatCompactMoney(980)).toBe("€980");
    expect(formatCompactMoney(9_850)).toBe("€9,850");
    expect(formatCompactMoney(41_200)).toBe("€41.2k");
    expect(formatCompactMoney(41_000)).toBe("€41k");
    expect(formatCompactMoney(412_000)).toBe("€412k");
    expect(formatCompactMoney(412_499)).toBe("€412k");
    expect(formatCompactMoney(1_200_000)).toBe("€1.2M");
    expect(formatCompactMoney(2_000_000)).toBe("€2M");
  });

  it("rounds sub-10k values to whole euros and keeps the sign", () => {
    expect(formatCompactMoney(980.4)).toBe("€980");
    expect(formatCompactMoney(0)).toBe("€0");
    expect(formatCompactMoney(-41_200)).toBe("−€41.2k");
  });

  it("degrades gracefully for non-finite input", () => {
    expect(formatCompactMoney(Number.NaN)).toBe("—");
  });
});

describe("formatMoney / formatSignedPct", () => {
  it("formats exact money without decimals", () => {
    expect(formatMoney(12_345.67)).toBe("€12,346");
    expect(formatMoney(-5)).toBe("−€5");
  });

  it("formats signed whole percentages", () => {
    expect(formatSignedPct(6.4)).toBe("+6 %");
    expect(formatSignedPct(-3.2)).toBe("−3 %");
    expect(formatSignedPct(0.2)).toBe("0 %");
    expect(formatSignedPct(null)).toBe("—");
  });
});

describe("comparisonWord / formatAboutPct", () => {
  it("treats |pct| < 2 as in line", () => {
    expect(comparisonWord(1.9)).toBe("in line with");
    expect(comparisonWord(-1.9)).toBe("in line with");
    expect(comparisonWord(2)).toBe("above");
    expect(comparisonWord(-2)).toBe("below");
  });

  it("says less than 1 % below 0.5 and rounds otherwise", () => {
    expect(formatAboutPct(0.4)).toBe("less than 1 %");
    expect(formatAboutPct(-0.4)).toBe("less than 1 %");
    expect(formatAboutPct(0.6)).toBe("about 1 %");
    expect(formatAboutPct(6.4)).toBe("about 6 %");
    expect(formatAboutPct(-17.6)).toBe("about 18 %");
  });
});

describe("horizonPhrase / trailingPhrase", () => {
  it("reuses the shared horizon labels", () => {
    expect(horizonPhrase(7)).toBe("the next 7 days");
    expect(horizonPhrase(14)).toBe("the next 2 weeks");
    expect(horizonPhrase(30)).toBe("the next 30 days");
    expect(horizonPhrase(90)).toBe("the next 90 days");
    expect(horizonPhrase(21)).toBe("the next 21 days");
  });

  it("mirrors the trailing window", () => {
    expect(trailingPhrase(14)).toBe("the previous 2 weeks");
    expect(trailingPhrase(30)).toBe("the previous 30 days");
  });
});

describe("dates", () => {
  it("formats ISO dates without touching the local timezone", () => {
    expect(formatDayLabel("2025-09-13")).toBe("Sat 13 Sep");
    expect(formatDayLabel("2025-09-13", { weekday: false })).toBe("13 Sep");
    expect(formatDayLabel("2025-01-01", { year: true })).toBe("Wed 1 Jan 2025");
    expect(weekdayName("2025-09-13")).toBe("Saturday");
  });

  it("returns the raw input for garbage", () => {
    expect(formatDayLabel("nope")).toBe("nope");
  });

  it("describes how long ago a cached result was computed", () => {
    const now = new Date("2025-09-14T08:00:00Z");
    expect(describeComputedAge("2025-09-14T07:59:40Z", now)).toBe(
      "computed just now",
    );
    expect(describeComputedAge("2025-09-14T07:25:00Z", now)).toBe(
      "computed 35 min ago",
    );
    expect(describeComputedAge("2025-09-14T06:00:00Z", now)).toBe(
      "computed 2 h ago",
    );
    expect(describeComputedAge("2025-09-13T07:00:00Z", now)).toBe(
      "computed yesterday",
    );
    expect(describeComputedAge("2025-09-10T07:00:00Z", now)).toBe(
      "computed 4 days ago",
    );
    expect(describeComputedAge("garbage", now)).toBe("computed earlier");
  });
});

describe("headline", () => {
  it("prefers the same-period-last-year comparison", () => {
    const result = makeForecastResult();
    const parts = headlineParts(result);
    expect(parts.prefix).toBe("Expected sales for the next 30 days:");
    expect(parts.amount).toBe(formatCompactMoney(result.summary.horizonTotal));
    expect(parts.suffix).toBe(", about 6 % above the same period last year.");
    expect(headlineSentence(result)).toBe(
      `Expected sales for the next 30 days: ${parts.amount}, about 6 % above the same period last year.`,
    );
  });

  it("falls back to the trailing period, then to a bare total", () => {
    const base = makeForecastResult();
    const trailing = makeForecastResult({
      summary: {
        ...base.summary,
        vsLastYearPct: null,
        samePeriodLastYear: null,
        vsTrailingPct: -4,
      },
    });
    expect(headlineParts(trailing).suffix).toBe(
      ", about 4 % below the previous 30 days.",
    );

    const bare = makeForecastResult({
      summary: { ...base.summary, vsLastYearPct: null, vsTrailingPct: null },
    });
    expect(headlineParts(bare).suffix).toBe(".");
  });

  it("uses 'in line with' for small deltas", () => {
    const base = makeForecastResult();
    const result = makeForecastResult({
      summary: { ...base.summary, vsLastYearPct: 1.2 },
    });
    expect(headlineParts(result).suffix).toBe(
      ", in line with the same period last year.",
    );
  });
});

describe("confidence", () => {
  it("labels grades in plain words", () => {
    expect(
      confidenceLabel({ ...makeForecastResult().accuracy!, grade: "high" }),
    ).toBe("High confidence");
    expect(
      confidenceLabel({ ...makeForecastResult().accuracy!, grade: "medium" }),
    ).toBe("Moderate confidence");
    expect(
      confidenceLabel({ ...makeForecastResult().accuracy!, grade: "low" }),
    ).toBe("Low confidence");
    expect(confidenceLabel(null)).toBe("Confidence not measured");
  });

  it("uses MAPE, falls back to WAPE, and explains when unmeasured", () => {
    const accuracy = makeForecastResult().accuracy!;
    expect(typicalMissPct(accuracy)).toBe(9.1);
    expect(typicalMissPct({ ...accuracy, mapePct: null })).toBe(8.2);
    expect(typicalMissPct(null)).toBeNull();

    expect(confidenceSentence(accuracy)).toBe(
      "We tested this model on the last 28 days it had not seen; it was typically off by about 9 %.",
    );
    expect(confidenceSentence({ ...accuracy, mapePct: null })).toContain(
      "about 8 %",
    );
    expect(confidenceSentence(null)).toMatch(/could not measure/);
    expect(confidenceSentence({ ...accuracy, holdoutDays: 0 })).toMatch(
      /could not measure/,
    );
  });

  it("never leaks jargon into the plain sentences", () => {
    const accuracy = makeForecastResult().accuracy!;
    for (const text of [
      confidenceSentence(accuracy),
      confidenceLabel(accuracy),
    ]) {
      expect(text).not.toMatch(/MAPE|WAPE|MAE|holdout/i);
    }
  });
});

describe("trend & seasonality", () => {
  it("describes the trend direction", () => {
    expect(
      trendSentence(
        makeForecastResult({ trendDirection: "up", trendPctPer30d: 4 }),
      ),
    ).toBe("Sales are trending up, roughly 4 % per month.");
    expect(
      trendSentence(
        makeForecastResult({ trendDirection: "down", trendPctPer30d: -2.6 }),
      ),
    ).toBe("Sales are trending down, roughly 3 % per month.");
    expect(
      trendSentence(
        makeForecastResult({ trendDirection: "flat", trendPctPer30d: 0 }),
      ),
    ).toBe("Sales are holding steady month to month.");
  });

  it("writes the weekday note", () => {
    const seasonality = makeForecastResult().seasonality;
    expect(weekdayNote(seasonality)).toBe(
      "Saturdays are usually the busiest, about 18 % above an average day; Mondays are the quietest.",
    );
    expect(weekdayNote({ ...seasonality, weekdayUpliftPct: null })).toBe(
      "Saturdays are usually the busiest; Mondays are the quietest.",
    );
    expect(
      weekdayNote({
        ...seasonality,
        weakestWeekday: null,
        weekdayUpliftPct: null,
      }),
    ).toBe("Saturdays are usually the busiest.");
    expect(weekdayNote({ ...seasonality, strongestWeekday: null })).toBeNull();
  });

  it("builds seasonality chips including upcoming holidays", () => {
    const chips = seasonalityChips(makeForecastResult().seasonality);
    expect(chips.map((chip) => chip.label)).toEqual([
      "Busiest: Saturdays",
      "Quietest: Mondays",
      "Accounts for holidays",
      "Independence Day · 1 Oct (−12 %)",
    ]);
    expect(chips.at(-1)?.tone).toBe("holiday");
  });
});

describe("agreement & recommendation", () => {
  it("computes the spread of totals relative to their mean", () => {
    expect(spreadPct([100, 104])).toBeCloseTo(3.92, 2);
    expect(spreadPct([100])).toBe(0);
    expect(spreadPct([0, 0])).toBe(0);
  });

  it("needs two results and grades the spread", () => {
    const a = makeForecastResult();
    expect(agreementSentence([a])).toBeNull();

    const within = makeForecastResult({
      modelId: "statistical_baseline",
      modelName: "Statistical Baseline",
      summary: { ...a.summary, horizonTotal: a.summary.horizonTotal * 1.04 },
    });
    expect(agreementSentence([a, within])).toBe(
      "The two models are within 4 % of each other, so the outlook is fairly robust.",
    );

    const differ = makeForecastResult({
      modelId: "statistical_baseline",
      summary: { ...a.summary, horizonTotal: a.summary.horizonTotal * 1.1 },
    });
    expect(agreementSentence([a, differ])).toMatch(/differ by 10 %/);

    const disagree = makeForecastResult({
      modelId: "statistical_baseline",
      summary: { ...a.summary, horizonTotal: a.summary.horizonTotal * 1.2 },
    });
    expect(agreementSentence([a, disagree])).toMatch(
      /disagree by 18 % — open Compare/,
    );
  });

  it("recommends the most accurate model, or the average when tied/unmeasured", () => {
    const a = makeForecastResult();
    const b = makeForecastResult({
      modelId: "statistical_baseline",
      modelName: "Statistical Baseline",
      accuracy: { ...a.accuracy!, mapePct: 14, wapePct: 13 },
    });
    expect(compareRecommendation([a, b])).toBe(
      "Seasonal Trend has been the most accurate on recent data (typically off by about 9 %), so lean on it for planning. Statistical Baseline is a useful cross-check.",
    );

    const tied = makeForecastResult({
      modelId: "statistical_baseline",
      modelName: "Statistical Baseline",
      accuracy: { ...a.accuracy!, mapePct: 9.5 },
    });
    expect(compareRecommendation([a, tied])).toMatch(/similarly accurate/);

    const unmeasured = [
      makeForecastResult({ accuracy: null }),
      makeForecastResult({ modelId: "statistical_baseline", accuracy: null }),
    ];
    expect(compareRecommendation(unmeasured)).toMatch(
      /None of the models could be accuracy-tested/,
    );

    expect(compareRecommendation([a])).toBe(
      "Only Seasonal Trend ran — add another model for a cross-check.",
    );
    expect(compareRecommendation([])).toBe("No forecasts to compare yet.");
  });
});

describe("analyst section", () => {
  it("lists the accuracy metrics with plain hints", () => {
    const metrics = analystMetrics(makeForecastResult());
    const labels = metrics.map((metric) => metric.label);
    expect(labels).toEqual([
      "WAPE",
      "MAPE",
      "MAE",
      "Bias",
      "80 % band coverage",
      "Holdout",
      "Cutoff",
      "Model version",
      "Runtime",
    ]);
    expect(metrics[0].value).toBe("8.2 %");
    expect(metrics[2].value).toBe("€412");
    expect(metrics[5].value).toBe("28 days · 1 fold");
    expect(metrics[6].value).toBe("Sat 13 Sep 2025");
    expect(metrics[8].hint).toBe("Computed on request");
  });

  it("skips accuracy metrics when unmeasured and flags cached runs", () => {
    const metrics = analystMetrics(
      makeForecastResult({ accuracy: null, cached: true }),
    );
    expect(metrics.map((metric) => metric.label)).toEqual([
      "Cutoff",
      "Model version",
      "Runtime",
    ]);
    expect(metrics[2].hint).toBe("Served from cache");
  });

  it("writes the one-line summary", () => {
    expect(analystSummaryLine(makeForecastResult())).toBe(
      "WAPE 8.2 % · MAPE 9.1 % · MAE €412 · holdout 28 d · cutoff 2025-09-13 · 1.4 s",
    );
    expect(analystSummaryLine(makeForecastResult({ accuracy: null }))).toBe(
      "accuracy not measured · cutoff 2025-09-13 · 1.4 s",
    );
  });
});

describe("kpiTiles", () => {
  it("produces four tiles and omits last year when unknown", () => {
    const result = makeForecastResult();
    const tiles = kpiTiles(result);
    expect(tiles.map((tile) => tile.label)).toEqual([
      "Expected total · next 30 days",
      "vs same period last year",
      "vs the previous 30 days",
      "Best / quietest day",
    ]);
    expect(tiles[1].value).toBe("+6 %");
    expect(tiles[3].value).toBe("Sun 14 Sep");

    const noLy = kpiTiles(
      makeForecastResult({
        summary: {
          ...result.summary,
          vsLastYearPct: null,
          samePeriodLastYear: null,
        },
      }),
    );
    expect(noLy).toHaveLength(3);
  });
});

describe("errors, warnings, misc copy", () => {
  it("maps error codes to friendly copy", () => {
    expect(forecastErrorCopy("ENGINE_UNAVAILABLE").title).toBe(
      "The forecast service is unavailable",
    );
    expect(forecastErrorCopy("NOT_CONFIGURED").title).toBe(
      "The forecast service is unavailable",
    );
    expect(forecastErrorCopy("ENGINE_TIMEOUT").title).toBe(
      "This forecast took too long",
    );
    expect(forecastErrorCopy("INSUFFICIENT_HISTORY", "needs 60").message).toBe(
      "needs 60",
    );
    expect(forecastErrorCopy("WHATEVER").title).toBe("Something went wrong");
    expect(forecastErrorCopy("WHATEVER", "custom").message).toBe("custom");
  });

  it("maps warning codes and falls back to the engine message", () => {
    expect(forecastWarningCopy("GAPS_FILLED", "x")).toMatch(/treated as zero/);
    expect(forecastWarningCopy("NEW_CODE", "engine text")).toBe("engine text");
  });

  it("writes the insufficient history sentence", () => {
    expect(
      insufficientHistorySentence({
        brandName: "Burger King",
        modelName: "Seasonal Trend",
        historyDays: 41,
        minHistoryDays: 60,
      }),
    ).toBe(
      "Burger King has 41 days of sales history; Seasonal Trend needs at least 60.",
    );
    expect(
      insufficientHistorySentence({
        brandName: "KFC",
        modelName: "Seasonal Trend",
        historyDays: null,
        minHistoryDays: 60,
      }),
    ).toBe(
      "KFC does not have enough sales history yet; Seasonal Trend needs at least 60.",
    );
  });

  it("writes badges and status sentences", () => {
    expect(minHistoryBadge({ minHistoryDays: 60 })).toBe("Needs 60+ days");
    expect(cardStatusSentence("Seasonal Trend", "loading")).toBe(
      "Seasonal Trend forecast is loading.",
    );
    expect(cardStatusSentence("Seasonal Trend", "error")).toBe(
      "Seasonal Trend forecast failed.",
    );
    expect(
      cardStatusSentence("Seasonal Trend", "ready", makeForecastResult()),
    ).toMatch(/^Seasonal Trend forecast ready\. Expected sales/);
  });
});
