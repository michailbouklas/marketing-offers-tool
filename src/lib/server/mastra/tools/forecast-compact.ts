import {
  buildCompareTableRows,
  compareSpread,
} from "../../../services/forecasts/forecast-chart-data";
import {
  agreementSentence,
  compareRecommendation,
  confidenceSentence,
  forecastWarningCopy,
  headlineSentence,
  trendSentence,
  weekdayName,
  weekdayNote,
} from "../../../services/forecasts/forecast-narrative";
import type {
  ForecastAccuracyGrade,
  ForecastResult,
  ForecastTrendDirection,
} from "../../../services/forecasts/forecast-types";

/**
 * Shrinks a `ForecastResult` (≈ 40 KB with a year of history) into the few
 * kilobytes a chat model actually needs, with every figure already rounded
 * and every sentence pre-written by the same helpers the UI uses
 * (`forecast-narrative.ts`). The agent is instructed to relay these numbers,
 * never to derive its own — so daily arrays are only kept for short horizons
 * and longer horizons are bucketed into weeks.
 *
 * Pure module: relative imports of browser-safe forecast modules only (this
 * directory must stay bundlable by `mastra dev`, see ../env.ts).
 */

/** Horizons up to this many days keep the day-by-day forecast. */
export const DAILY_DETAIL_MAX_HORIZON = 14;

/** Money is rounded to whole euros — enough for planning, fewer tokens. */
function money(value: number): number {
  return Math.round(value);
}

/** Percentages keep one decimal. */
function pct(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

export type CompactDailyPoint = {
  ds: string;
  weekday: string;
  yhat: number;
  lo80: number;
  hi80: number;
};

export type CompactWeeklyBucket = {
  from: string;
  to: string;
  days: number;
  total: number;
  /** Sum of the daily 80 % lower bounds — an approximate weekly range. */
  lo80: number;
  hi80: number;
};

export type CompactAccuracy = {
  wapePct: number;
  mapePct: number | null;
  mae: number;
  biasPct: number;
  coverage80Pct: number | null;
  holdoutDays: number;
  folds: number;
  grade: ForecastAccuracyGrade;
  gradeLabel: string;
};

export type CompactForecast = {
  modelId: string;
  modelName: string;
  modelVersion: string;
  brandAlias: string | null;
  brandName: string | null;
  locationId: number | null;
  locationName: string | null;
  horizonDays: number;
  /** Last day with recorded sales; the forecast starts the day after. */
  cutoffDate: string;
  forecastStart: string | null;
  forecastEnd: string | null;
  /** True when served from the app's cache rather than computed now. */
  cached: boolean;
  runtimeMs: number;
  missingDays: number | null;
  summary: {
    horizonTotal: number;
    horizonLower80: number;
    horizonUpper80: number;
    averageDaily: number;
    samePeriodLastYear: number | null;
    vsLastYearPct: number | null;
    trailingPeriodTotal: number;
    vsTrailingPct: number | null;
    peakDay: string;
    peakDayValue: number;
    lowDay: string;
    lowDayValue: number;
    averageOrderValue: number | null;
  };
  accuracy: CompactAccuracy | null;
  trend: { direction: ForecastTrendDirection; pctPer30d: number | null };
  seasonality: {
    strongestWeekday: string | null;
    weakestWeekday: string | null;
    weekdayUpliftPct: number | null;
    yearlySeasonalityUsed: boolean;
    holidaysUsed: boolean;
    upcomingHolidays: {
      ds: string;
      name: string;
      expectedEffectPct: number | null;
    }[];
    notes: string[];
  };
  warnings: { code: string; text: string }[];
  /** Ready-made sentences (same copy as the UI). */
  narrative: {
    headline: string;
    confidence: string;
    trend: string;
    weekday: string | null;
  };
  daily?: CompactDailyPoint[];
  weekly?: CompactWeeklyBucket[];
};

export function compactAccuracy(
  accuracy: ForecastResult["accuracy"],
): CompactAccuracy | null {
  if (!accuracy) {
    return null;
  }
  return {
    wapePct: pct(accuracy.wapePct) ?? 0,
    mapePct: pct(accuracy.mapePct),
    mae: money(accuracy.mae),
    biasPct: pct(accuracy.biasPct) ?? 0,
    coverage80Pct: pct(accuracy.coverage80Pct),
    holdoutDays: accuracy.holdoutDays,
    folds: accuracy.folds,
    grade: accuracy.grade,
    gradeLabel: accuracy.gradeLabel,
  };
}

export function weeklyBuckets(
  forecast: ForecastResult["forecast"],
): CompactWeeklyBucket[] {
  const buckets: CompactWeeklyBucket[] = [];
  for (let start = 0; start < forecast.length; start += 7) {
    const chunk = forecast.slice(start, start + 7);
    const sum = (key: "yhat" | "lo80" | "hi80") =>
      money(chunk.reduce((total, point) => total + point[key], 0));
    buckets.push({
      from: chunk[0].ds,
      to: chunk[chunk.length - 1].ds,
      days: chunk.length,
      total: sum("yhat"),
      lo80: sum("lo80"),
      hi80: sum("hi80"),
    });
  }
  return buckets;
}

/**
 * @param options.series — include the day/week breakdown (default true).
 *   Comparison output turns it off so N models stay small.
 */
export function compactForecast(
  result: ForecastResult,
  options: { series?: boolean } = {},
): CompactForecast {
  const includeSeries = options.series ?? true;
  const { summary } = result;

  const compact: CompactForecast = {
    modelId: result.modelId,
    modelName: result.modelName,
    modelVersion: result.modelVersion,
    brandAlias: result.brandAlias ?? null,
    brandName: result.brandName ?? null,
    locationId: result.locationId ?? null,
    locationName: result.locationName ?? null,
    horizonDays: result.horizonDays,
    cutoffDate: result.cutoffDate,
    forecastStart: result.forecast[0]?.ds ?? null,
    forecastEnd: result.forecast[result.forecast.length - 1]?.ds ?? null,
    cached: result.cached ?? false,
    runtimeMs: Math.round(result.runtimeMs),
    missingDays: result.missingDays ?? null,
    summary: {
      horizonTotal: money(summary.horizonTotal),
      horizonLower80: money(summary.horizonLower80),
      horizonUpper80: money(summary.horizonUpper80),
      averageDaily: money(summary.averageDaily),
      samePeriodLastYear:
        summary.samePeriodLastYear === null
          ? null
          : money(summary.samePeriodLastYear),
      vsLastYearPct: pct(summary.vsLastYearPct),
      trailingPeriodTotal: money(summary.trailingPeriodTotal),
      vsTrailingPct: pct(summary.vsTrailingPct),
      peakDay: summary.peakDay,
      peakDayValue: money(summary.peakDayValue),
      lowDay: summary.lowDay,
      lowDayValue: money(summary.lowDayValue),
      averageOrderValue:
        summary.averageOrderValue === null
          ? null
          : Math.round(summary.averageOrderValue * 100) / 100,
    },
    accuracy: compactAccuracy(result.accuracy),
    trend: {
      direction: result.trendDirection,
      pctPer30d: pct(result.trendPctPer30d),
    },
    seasonality: {
      strongestWeekday: result.seasonality.strongestWeekday,
      weakestWeekday: result.seasonality.weakestWeekday,
      weekdayUpliftPct: pct(result.seasonality.weekdayUpliftPct),
      yearlySeasonalityUsed: result.seasonality.yearlySeasonalityUsed,
      holidaysUsed: result.seasonality.holidaysUsed,
      upcomingHolidays: result.seasonality.upcomingHolidays.map((holiday) => ({
        ds: holiday.ds,
        name: holiday.name,
        expectedEffectPct: pct(holiday.expectedEffectPct),
      })),
      notes: result.seasonality.notes,
    },
    warnings: result.warnings.map((warning) => ({
      code: warning.code,
      text: forecastWarningCopy(warning.code, warning.message),
    })),
    narrative: {
      headline: headlineSentence(result),
      confidence: confidenceSentence(result.accuracy),
      trend: trendSentence(result),
      weekday: weekdayNote(result.seasonality),
    },
  };

  if (!includeSeries) {
    return compact;
  }

  if (result.horizonDays <= DAILY_DETAIL_MAX_HORIZON) {
    compact.daily = result.forecast.map((point) => ({
      ds: point.ds,
      weekday: weekdayName(point.ds),
      yhat: money(point.yhat),
      lo80: money(point.lo80),
      hi80: money(point.hi80),
    }));
  } else {
    compact.weekly = weeklyBuckets(result.forecast);
  }

  return compact;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export type CompareFailure = {
  modelId: string;
  code: string;
  message: string;
};

export type CompactCompareRow = {
  modelId: string;
  modelName: string;
  total: number;
  lower80: number;
  upper80: number;
  averageDaily: number;
  vsLastYearPct: number | null;
  vsTrailingPct: number | null;
  grade: ForecastAccuracyGrade | null;
  gradeLabel: string | null;
  /** MAPE when measured, else WAPE — the "typically off by" figure. */
  typicalMissPct: number | null;
  wapePct: number | null;
};

export type CompactCompare = {
  horizonDays: number | null;
  cutoffDate: string | null;
  brandAlias: string | null;
  locationName: string | null;
  /** Same rows as the Compare page table, rounded. */
  table: CompactCompareRow[];
  spread: {
    minTotal: number;
    maxTotal: number;
    averageTotal: number;
    spreadPct: number;
  } | null;
  /** "The three models are within 4 % of each other…" (null with < 2 results). */
  agreement: string | null;
  /** Same sentence the Compare page prints under "Which number to plan with". */
  recommendation: string;
  /** Per-model detail without the day/week series. */
  perModel: Record<string, CompactForecast>;
  failures: CompareFailure[];
};

export function buildCompareOutput(
  results: ForecastResult[],
  failures: CompareFailure[],
): CompactCompare {
  const first = results[0];
  const spread = compareSpread(results);

  return {
    horizonDays: first?.horizonDays ?? null,
    cutoffDate: first?.cutoffDate ?? null,
    brandAlias: first?.brandAlias ?? null,
    locationName: first?.locationName ?? null,
    table: buildCompareTableRows(results).map((row) => ({
      modelId: row.modelId,
      modelName: row.modelName,
      total: money(row.total),
      lower80: money(row.lower80),
      upper80: money(row.upper80),
      averageDaily: money(row.averageDaily),
      vsLastYearPct: pct(row.vsLastYearPct),
      vsTrailingPct: pct(row.vsTrailingPct),
      grade: row.accuracy?.grade ?? null,
      gradeLabel: row.accuracy?.gradeLabel ?? null,
      typicalMissPct: pct(row.typicalMissPct),
      wapePct: pct(row.accuracy?.wapePct),
    })),
    spread: spread
      ? {
          minTotal: money(spread.minTotal),
          maxTotal: money(spread.maxTotal),
          averageTotal: money(spread.averageTotal),
          spreadPct: pct(spread.spreadPct) ?? 0,
        }
      : null,
    agreement: agreementSentence(results),
    recommendation: compareRecommendation(results),
    perModel: Object.fromEntries(
      results.map((result) => [
        result.modelId,
        compactForecast(result, { series: false }),
      ]),
    ),
    failures,
  };
}
