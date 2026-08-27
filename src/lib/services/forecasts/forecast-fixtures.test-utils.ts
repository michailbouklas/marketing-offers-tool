import type {
  ForecastHistoryPoint,
  ForecastModel,
  ForecastPoint,
  ForecastResult,
} from "./forecast-types";
import { isoDateToUtc, utcToIsoDate } from "./forecast-narrative";

/**
 * Deterministic fixtures for the forecast UI unit tests (not a test file
 * itself — vitest only picks up `*.test.ts`).
 */

export const fixtureCatalog: ForecastModel[] = [
  {
    id: "seasonal_trend",
    name: "Seasonal Trend",
    description: "Weekly and yearly patterns plus public holidays.",
    version: "1.0",
    minHistoryDays: 60,
    recommendedHorizons: [7, 14, 30, 90],
    supportsHolidays: true,
  },
  {
    id: "statistical_baseline",
    name: "Statistical Baseline",
    description: "Robust statistical method with a weekly pattern.",
    version: "1.0",
    minHistoryDays: 56,
    recommendedHorizons: [7, 14, 30],
    supportsHolidays: false,
  },
];

export function addDays(ds: string, days: number): string {
  const date = isoDateToUtc(ds);
  date.setUTCDate(date.getUTCDate() + days);
  return utcToIsoDate(date);
}

export function makeHistory(
  cutoffDate: string,
  days: number,
  base = 10_000,
): ForecastHistoryPoint[] {
  const points: ForecastHistoryPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const ds = addDays(cutoffDate, -offset);
    const weekday = isoDateToUtc(ds).getUTCDay();
    const y = base + (weekday === 6 ? 2_000 : 0) + (offset % 3) * 100;
    points.push({ ds, y, fitted: y - 50 });
  }
  return points;
}

export function makeForecast(
  cutoffDate: string,
  horizonDays: number,
  base = 10_200,
): ForecastPoint[] {
  const points: ForecastPoint[] = [];
  for (let step = 1; step <= horizonDays; step += 1) {
    const ds = addDays(cutoffDate, step);
    const weekday = isoDateToUtc(ds).getUTCDay();
    const yhat = base + (weekday === 6 ? 2_000 : 0);
    points.push({
      ds,
      yhat,
      lo80: yhat * 0.9,
      hi80: yhat * 1.1,
      lo95: yhat * 0.8,
      hi95: yhat * 1.2,
    });
  }
  return points;
}

export function makeForecastResult(
  overrides: Partial<ForecastResult> & {
    horizonDays?: number;
    historyDays?: number;
  } = {},
): ForecastResult {
  const cutoffDate = overrides.cutoffDate ?? "2025-09-13";
  const horizonDays = overrides.horizonDays ?? 30;
  const historyDays = overrides.historyDays ?? 90;
  const forecast = overrides.forecast ?? makeForecast(cutoffDate, horizonDays);
  const horizonTotal = forecast.reduce((sum, point) => sum + point.yhat, 0);

  const { historyDays: _ignored, ...rest } = overrides;

  return {
    modelId: "seasonal_trend",
    modelName: "Seasonal Trend",
    modelVersion: "1.0",
    engineVersion: "0.1.0",
    horizonDays,
    cutoffDate,
    history: makeHistory(cutoffDate, historyDays),
    forecast,
    summary: {
      horizonTotal,
      horizonLower80: horizonTotal * 0.9,
      horizonUpper80: horizonTotal * 1.1,
      samePeriodLastYear: horizonTotal / 1.06,
      vsLastYearPct: 6,
      trailingPeriodTotal: horizonTotal / 1.03,
      vsTrailingPct: 3,
      averageDaily: horizonTotal / horizonDays,
      peakDay: addDays(cutoffDate, 1),
      peakDayValue: 12_200,
      lowDay: addDays(cutoffDate, 2),
      lowDayValue: 10_200,
      averageOrderValue: 14.2,
    },
    accuracy: {
      holdoutDays: 28,
      folds: 1,
      wapePct: 8.2,
      mapePct: 9.1,
      mae: 412,
      biasPct: 1.5,
      coverage80Pct: 78,
      grade: "high",
      gradeLabel: "High confidence",
    },
    trendDirection: "up",
    trendPctPer30d: 4,
    seasonality: {
      strongestWeekday: "Saturday",
      weakestWeekday: "Monday",
      weekdayUpliftPct: 18,
      yearlySeasonalityUsed: false,
      holidaysUsed: true,
      upcomingHolidays: [
        {
          ds: addDays(cutoffDate, 18),
          name: "Independence Day",
          expectedEffectPct: -12,
        },
      ],
      notes: [],
    },
    warnings: [],
    runtimeMs: 1_400,
    generatedAt: "2025-09-14T06:00:00.000Z",
    brandAlias: "bk",
    brandName: "Burger King",
    cached: false,
    missingDays: 0,
    ...rest,
  };
}
