import {
  formatDayLabel,
  isoDateToUtc,
  typicalMissPct,
  utcToIsoDate,
  weekdayName,
} from "./forecast-narrative";
import type { ForecastAccuracy, ForecastResult } from "./forecast-types";

/**
 * Pure data preparation for the forecast charts and tables. Components only
 * bind these rows to layerchart / table primitives.
 */

/** Upper bound of x-axis tick labels so long ranges do not crowd the axis. */
export const MAX_AXIS_TICKS = 8;

/** Headroom above the tallest value so the top of a band never touches the frame. */
export const Y_HEADROOM = 1.05;

// ---------------------------------------------------------------------------
// Single-model chart rows
// ---------------------------------------------------------------------------

export type ChartRow = {
  date: Date;
  ds: string;
  actual: number | null;
  forecast: number | null;
  lo80: number | null;
  hi80: number | null;
  lo95: number | null;
  hi95: number | null;
  /**
   * The last actual day, duplicated into the forecast columns so the forecast
   * line and band visually continue from the last real point.
   */
  seam: boolean;
};

/** Actual days shown before the cutoff: enough context for the horizon. */
export function defaultContextDays(horizonDays: number): number {
  return Math.max(28, horizonDays * 2);
}

function emptyRow(ds: string): ChartRow {
  return {
    date: isoDateToUtc(ds),
    ds,
    actual: null,
    forecast: null,
    lo80: null,
    hi80: null,
    lo95: null,
    hi95: null,
    seam: false,
  };
}

export function buildChartRows(
  result: ForecastResult,
  options: { contextDays?: number } = {},
): ChartRow[] {
  const contextDays =
    options.contextDays ?? defaultContextDays(result.horizonDays);
  const history = contextDays > 0 ? result.history.slice(-contextDays) : [];

  const rows: ChartRow[] = history.map((point) => ({
    ...emptyRow(point.ds),
    actual: point.y,
  }));

  const seam = rows.at(-1);
  if (seam && result.forecast.length > 0) {
    seam.forecast = seam.actual;
    seam.lo80 = seam.actual;
    seam.hi80 = seam.actual;
    seam.lo95 = seam.actual;
    seam.hi95 = seam.actual;
    seam.seam = true;
  }

  for (const point of result.forecast) {
    rows.push({
      ...emptyRow(point.ds),
      forecast: point.yhat,
      lo80: point.lo80,
      hi80: point.hi80,
      lo95: point.lo95,
      hi95: point.hi95,
    });
  }

  return rows;
}

/** Top of the y domain: the tallest actual / forecast / band value plus headroom. */
export function yMax(
  rows: ChartRow[],
  options: { wide?: boolean } = {},
): number {
  let max = 0;
  for (const row of rows) {
    const candidates = [row.actual, row.forecast, row.hi80];
    if (options.wide) {
      candidates.push(row.hi95);
    }
    for (const value of candidates) {
      if (value !== null && Number.isFinite(value) && value > max) {
        max = value;
      }
    }
  }
  return max > 0 ? max * Y_HEADROOM : 1;
}

// ---------------------------------------------------------------------------
// Multi-model compare rows
// ---------------------------------------------------------------------------

export type CompareRow = {
  date: Date;
  ds: string;
  actual: number | null;
  /** Forecast per model id (null before the cutoff, seam value on the cutoff day). */
  models: Record<string, number | null>;
};

export function buildCompareRows(
  results: ForecastResult[],
  options: { contextDays?: number } = {},
): CompareRow[] {
  if (results.length === 0) {
    return [];
  }
  const horizon = Math.max(...results.map((result) => result.horizonDays));
  const contextDays = options.contextDays ?? defaultContextDays(horizon);
  const modelIds = results.map((result) => result.modelId);

  const byDs = new Map<string, CompareRow>();
  const ensure = (ds: string): CompareRow => {
    let row = byDs.get(ds);
    if (!row) {
      row = {
        date: isoDateToUtc(ds),
        ds,
        actual: null,
        models: Object.fromEntries(modelIds.map((id) => [id, null])),
      };
      byDs.set(ds, row);
    }
    return row;
  };

  for (const result of results) {
    const history = contextDays > 0 ? result.history.slice(-contextDays) : [];
    for (const point of history) {
      const row = ensure(point.ds);
      row.actual = row.actual ?? point.y;
    }
    const last = history.at(-1);
    if (last && result.forecast.length > 0) {
      ensure(last.ds).models[result.modelId] = last.y;
    }
    for (const point of result.forecast) {
      ensure(point.ds).models[result.modelId] = point.yhat;
    }
  }

  return [...byDs.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function compareYMax(rows: CompareRow[]): number {
  let max = 0;
  for (const row of rows) {
    if (row.actual !== null && row.actual > max) {
      max = row.actual;
    }
    for (const value of Object.values(row.models)) {
      if (value !== null && value > max) {
        max = value;
      }
    }
  }
  return max > 0 ? max * Y_HEADROOM : 1;
}

/** Widest 80 % band across the compared models, for the optional band toggle. */
export type CompareBandRow = { date: Date; ds: string; lo: number; hi: number };

export function buildCompareBandRows(result: ForecastResult): CompareBandRow[] {
  return result.forecast.map((point) => ({
    date: isoDateToUtc(point.ds),
    ds: point.ds,
    lo: point.lo80,
    hi: point.hi80,
  }));
}

// ---------------------------------------------------------------------------
// Axis & tooltip formatting
// ---------------------------------------------------------------------------

/** Subsamples dates so at most `max` ticks are shown, always keeping the first. */
export function axisTicks<T extends { date: Date }>(
  rows: readonly T[],
  max: number = MAX_AXIS_TICKS,
): Date[] {
  if (rows.length === 0) {
    return [];
  }
  const step = Math.max(1, Math.ceil(rows.length / max));
  return rows.filter((_, index) => index % step === 0).map((row) => row.date);
}

/** "14 Sep" */
export function formatAxisDay(date: Date): string {
  return formatDayLabel(utcToIsoDate(date), { weekday: false });
}

/** "Sat 14 Sep 2025" */
export function formatTooltipDay(date: Date): string {
  return formatDayLabel(utcToIsoDate(date), { year: true });
}

/** Cutoff as a Date for the "Today" annotation. */
export function cutoffAsDate(result: ForecastResult): Date {
  return isoDateToUtc(result.cutoffDate);
}

// ---------------------------------------------------------------------------
// Day table & CSV
// ---------------------------------------------------------------------------

export type DayRow = {
  ds: string;
  /** "Sat 14 Sep" */
  label: string;
  weekday: string;
  forecast: number;
  lo80: number;
  hi80: number;
  lo95: number;
  hi95: number;
  isPeak: boolean;
  isLow: boolean;
};

export function buildDayRows(result: ForecastResult): DayRow[] {
  return result.forecast.map((point) => ({
    ds: point.ds,
    label: formatDayLabel(point.ds),
    weekday: weekdayName(point.ds),
    forecast: point.yhat,
    lo80: point.lo80,
    hi80: point.hi80,
    lo95: point.lo95,
    hi95: point.hi95,
    isPeak: point.ds === result.summary.peakDay,
    isLow: point.ds === result.summary.lowDay,
  }));
}

function csvCell(value: string | number): string {
  const text = typeof value === "number" ? value.toFixed(2) : value;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const DAY_CSV_HEADER = [
  "date",
  "weekday",
  "forecast",
  "likely_low_80",
  "likely_high_80",
  "low_95",
  "high_95",
] as const;

export function dayRowsToCsv(rows: DayRow[]): string {
  const lines = [DAY_CSV_HEADER.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.ds,
        row.weekday,
        row.forecast,
        row.lo80,
        row.hi80,
        row.lo95,
        row.hi95,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function csvFileName(result: ForecastResult): string {
  const brand = (result.brandAlias ?? "brand").replace(/[^a-z0-9_-]/gi, "");
  return `forecast-${brand}-${result.modelId}-${result.horizonDays}d-from-${result.cutoffDate}.csv`;
}

// ---------------------------------------------------------------------------
// Compare table
// ---------------------------------------------------------------------------

export type CompareTableRow = {
  modelId: string;
  modelName: string;
  total: number;
  lower80: number;
  upper80: number;
  vsLastYearPct: number | null;
  vsTrailingPct: number | null;
  averageDaily: number;
  accuracy: ForecastAccuracy | null;
  typicalMissPct: number | null;
};

export function buildCompareTableRows(
  results: ForecastResult[],
): CompareTableRow[] {
  return results.map((result) => ({
    modelId: result.modelId,
    modelName: result.modelName,
    total: result.summary.horizonTotal,
    lower80: result.summary.horizonLower80,
    upper80: result.summary.horizonUpper80,
    vsLastYearPct: result.summary.vsLastYearPct,
    vsTrailingPct: result.summary.vsTrailingPct,
    averageDaily: result.summary.averageDaily,
    accuracy: result.accuracy,
    typicalMissPct: typicalMissPct(result.accuracy),
  }));
}

export type CompareSpread = {
  minTotal: number;
  maxTotal: number;
  /** Max − min as a share of the mean, in percent. */
  spreadPct: number;
  averageTotal: number;
};

export function compareSpread(results: ForecastResult[]): CompareSpread | null {
  if (results.length < 2) {
    return null;
  }
  const totals = results.map((result) => result.summary.horizonTotal);
  const minTotal = Math.min(...totals);
  const maxTotal = Math.max(...totals);
  const averageTotal =
    totals.reduce((sum, value) => sum + value, 0) / totals.length;
  const spreadPct =
    averageTotal === 0
      ? 0
      : ((maxTotal - minTotal) / Math.abs(averageTotal)) * 100;
  return { minTotal, maxTotal, spreadPct, averageTotal };
}
