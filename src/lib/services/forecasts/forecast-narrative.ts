import type {
  ForecastAccuracy,
  ForecastAccuracyGrade,
  ForecastModel,
  ForecastResult,
  ForecastSeasonality,
} from "./forecast-types";
import { forecastHorizonLabels, isForecastHorizon } from "./forecast-types";

/**
 * Plain-language copy for the Sales Forecasts UI.
 *
 * Everything here is pure and unit-tested. The rule of the module: no
 * statistics jargon (MAPE, WAPE, holdout, ...) outside the functions that are
 * explicitly for the "Details for analysts" section.
 */

// ---------------------------------------------------------------------------
// Numbers & money
// ---------------------------------------------------------------------------

const CURRENCY = "€";

function stripTrailingZero(text: string): string {
  return text.replace(/\.0$/, "");
}

/**
 * Compact money for headlines and KPI tiles:
 * €980 · €9,850 · €41.2k · €412k · €1.2M
 */
export function formatCompactMoney(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);

  if (abs < 10_000) {
    return `${sign}${CURRENCY}${Math.round(abs).toLocaleString("en-US")}`;
  }
  if (abs < 100_000) {
    return `${sign}${CURRENCY}${stripTrailingZero((abs / 1_000).toFixed(1))}k`;
  }
  if (abs < 1_000_000) {
    return `${sign}${CURRENCY}${Math.round(abs / 1_000)}k`;
  }
  return `${sign}${CURRENCY}${stripTrailingZero((abs / 1_000_000).toFixed(1))}M`;
}

/** Exact money for tables: €12,345 (no decimals). */
export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  const sign = value < 0 ? "−" : "";
  return `${sign}${CURRENCY}${Math.round(Math.abs(value)).toLocaleString("en-US")}`;
}

/** "€11,900 – €14,600" style likely-range text. */
export function formatMoneyRange(low: number, high: number): string {
  return `${formatMoney(low)} – ${formatMoney(high)}`;
}

/** Compact "€11.9k–€14.6k" range for tooltips. */
export function formatCompactMoneyRange(low: number, high: number): string {
  return `${formatCompactMoney(low)}–${formatCompactMoney(high)}`;
}

/** Signed whole percentage for KPI tiles: +6 % · −3 % · 0 %. */
export function formatSignedPct(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) {
    return "—";
  }
  const rounded = Math.round(pct);
  if (rounded === 0) {
    return "0 %";
  }
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)} %`;
}

/** "about 6 %" / "less than 1 %" — magnitude only, sign dropped. */
export function formatAboutPct(pct: number): string {
  const abs = Math.abs(pct);
  if (abs < 0.5) {
    return "less than 1 %";
  }
  return `about ${Math.max(1, Math.round(abs))} %`;
}

/** Direction word for a percentage delta; |pct| < 2 reads as "in line with". */
export function comparisonWord(
  pct: number,
): "above" | "below" | "in line with" {
  if (Math.abs(pct) < 2) {
    return "in line with";
  }
  return pct > 0 ? "above" : "below";
}

/** "the next 30 days" / "the next 2 weeks" */
export function horizonPhrase(horizonDays: number): string {
  if (isForecastHorizon(horizonDays)) {
    return forecastHorizonLabels[horizonDays].replace(/^Next /, "the next ");
  }
  return `the next ${horizonDays} days`;
}

/** "the previous 30 days" — the trailing window the forecast is compared to. */
export function trailingPhrase(horizonDays: number): string {
  if (horizonDays === 14) {
    return "the previous 2 weeks";
  }
  return `the previous ${horizonDays} days`;
}

// ---------------------------------------------------------------------------
// Dates (UTC-safe: an ISO date string never touches the local timezone)
// ---------------------------------------------------------------------------

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function isoDateToUtc(ds: string): Date {
  return new Date(`${ds}T00:00:00Z`);
}

export function utcToIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "Saturday" for an ISO date. */
export function weekdayName(ds: string): string {
  return WEEKDAYS_LONG[isoDateToUtc(ds).getUTCDay()];
}

/**
 * "Sat 14 Sep" by default; `{ weekday: false }` → "14 Sep";
 * `{ year: true }` → "Sat 14 Sep 2025".
 */
export function formatDayLabel(
  ds: string,
  options: { weekday?: boolean; year?: boolean } = {},
): string {
  const { weekday = true, year = false } = options;
  const date = isoDateToUtc(ds);
  if (Number.isNaN(date.getTime())) {
    return ds;
  }
  const parts: string[] = [];
  if (weekday) {
    parts.push(WEEKDAYS_SHORT[date.getUTCDay()]);
  }
  parts.push(`${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()]}`);
  if (year) {
    parts.push(String(date.getUTCFullYear()));
  }
  return parts.join(" ");
}

/** "computed just now" / "computed 35 min ago" / "computed 2 h ago" / "computed yesterday". */
export function describeComputedAge(
  generatedAt: string,
  now: Date = new Date(),
): string {
  const then = new Date(generatedAt).getTime();
  if (Number.isNaN(then)) {
    return "computed earlier";
  }
  const minutes = Math.max(0, Math.round((now.getTime() - then) / 60_000));
  if (minutes < 1) {
    return "computed just now";
  }
  if (minutes < 60) {
    return `computed ${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `computed ${hours} h ago`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? "computed yesterday" : `computed ${days} days ago`;
}

// ---------------------------------------------------------------------------
// Headline
// ---------------------------------------------------------------------------

export type HeadlineParts = {
  /** "Expected sales for the next 30 days:" */
  prefix: string;
  /** "€412k" — rendered bold by the component. */
  amount: string;
  /** ", about 6 % above the same period last year." */
  suffix: string;
};

/**
 * Headline comparison preference: same period last year → trailing period →
 * bare total. Returns parts so the amount can be emphasised in the UI.
 */
export function headlineParts(result: ForecastResult): HeadlineParts {
  const { summary, horizonDays } = result;
  const prefix = `Expected sales for ${horizonPhrase(horizonDays)}:`;
  const amount = formatCompactMoney(summary.horizonTotal);

  const comparison = (pct: number, reference: string) => {
    const word = comparisonWord(pct);
    if (word === "in line with") {
      return `, in line with ${reference}.`;
    }
    return `, ${formatAboutPct(pct)} ${word} ${reference}.`;
  };

  if (summary.vsLastYearPct !== null) {
    return {
      prefix,
      amount,
      suffix: comparison(summary.vsLastYearPct, "the same period last year"),
    };
  }
  if (summary.vsTrailingPct !== null) {
    return {
      prefix,
      amount,
      suffix: comparison(summary.vsTrailingPct, trailingPhrase(horizonDays)),
    };
  }
  return { prefix, amount, suffix: "." };
}

export function headlineSentence(result: ForecastResult): string {
  const parts = headlineParts(result);
  return `${parts.prefix} ${parts.amount}${parts.suffix}`;
}

// ---------------------------------------------------------------------------
// Confidence (plain language; the numbers live in the analyst section)
// ---------------------------------------------------------------------------

const GRADE_LABELS: Record<ForecastAccuracyGrade, string> = {
  high: "High confidence",
  medium: "Moderate confidence",
  low: "Low confidence",
};

export function confidenceLabel(accuracy: ForecastAccuracy | null): string {
  if (!accuracy) {
    return "Confidence not measured";
  }
  return GRADE_LABELS[accuracy.grade];
}

/** The "typical miss" percentage: MAPE when available, else WAPE. */
export function typicalMissPct(
  accuracy: ForecastAccuracy | null,
): number | null {
  if (!accuracy) {
    return null;
  }
  return accuracy.mapePct ?? accuracy.wapePct;
}

/** "typically off by about 8 %" — or null when not measured. */
export function typicalMissPhrase(
  accuracy: ForecastAccuracy | null,
): string | null {
  const pct = typicalMissPct(accuracy);
  if (pct === null) {
    return null;
  }
  return `typically off by ${formatAboutPct(pct)}`;
}

export function confidenceSentence(accuracy: ForecastAccuracy | null): string {
  if (!accuracy || accuracy.holdoutDays === 0) {
    return "We could not measure this model's accuracy yet — there was not enough history to test it on.";
  }
  const days = accuracy.holdoutDays;
  return `We tested this model on the last ${days} day${days === 1 ? "" : "s"} it had not seen; it was ${typicalMissPhrase(accuracy)}.`;
}

// ---------------------------------------------------------------------------
// Trend & seasonality
// ---------------------------------------------------------------------------

export function trendSentence(result: ForecastResult): string {
  const pct = Math.abs(result.trendPctPer30d);
  switch (result.trendDirection) {
    case "up":
      return `Sales are trending up, roughly ${formatAboutPct(pct).replace(/^about /, "")} per month.`;
    case "down":
      return `Sales are trending down, roughly ${formatAboutPct(pct).replace(/^about /, "")} per month.`;
    default:
      return "Sales are holding steady month to month.";
  }
}

function pluralWeekday(day: string): string {
  return `${day}s`;
}

/**
 * "Saturdays are usually the busiest, about 18 % above an average day;
 * Mondays are the quietest." — null when the model reported no weekday pattern.
 */
export function weekdayNote(seasonality: ForecastSeasonality): string | null {
  const { strongestWeekday, weakestWeekday, weekdayUpliftPct } = seasonality;
  if (!strongestWeekday) {
    return null;
  }
  let text = `${pluralWeekday(strongestWeekday)} are usually the busiest`;
  if (weekdayUpliftPct !== null && Math.abs(weekdayUpliftPct) >= 0.5) {
    text += `, ${formatAboutPct(weekdayUpliftPct)} above an average day`;
  }
  if (weakestWeekday && weakestWeekday !== strongestWeekday) {
    text += `; ${pluralWeekday(weakestWeekday)} are the quietest`;
  }
  return `${text}.`;
}

export type SeasonalityChip = {
  label: string;
  tone: "neutral" | "holiday";
};

/** Short chips: weekday pattern, yearly pattern, holidays, engine notes. */
export function seasonalityChips(
  seasonality: ForecastSeasonality,
): SeasonalityChip[] {
  const chips: SeasonalityChip[] = [];
  if (seasonality.strongestWeekday) {
    chips.push({
      label: `Busiest: ${pluralWeekday(seasonality.strongestWeekday)}`,
      tone: "neutral",
    });
  }
  if (seasonality.weakestWeekday) {
    chips.push({
      label: `Quietest: ${pluralWeekday(seasonality.weakestWeekday)}`,
      tone: "neutral",
    });
  }
  if (seasonality.yearlySeasonalityUsed) {
    chips.push({ label: "Uses yearly pattern", tone: "neutral" });
  }
  if (seasonality.holidaysUsed) {
    chips.push({ label: "Accounts for holidays", tone: "holiday" });
  }
  for (const holiday of seasonality.upcomingHolidays) {
    const effect =
      holiday.expectedEffectPct === null
        ? ""
        : ` (${formatSignedPct(holiday.expectedEffectPct)})`;
    chips.push({
      label: `${holiday.name} · ${formatDayLabel(holiday.ds, { weekday: false })}${effect}`,
      tone: "holiday",
    });
  }
  for (const note of seasonality.notes) {
    chips.push({ label: note, tone: "neutral" });
  }
  return chips;
}

// ---------------------------------------------------------------------------
// Multi-model comparison
// ---------------------------------------------------------------------------

const COUNT_WORDS = ["", "one", "two", "three", "four", "five", "six"];

function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

/** Spread of horizon totals as a percentage of their mean (0 for < 2 results). */
export function spreadPct(totals: number[]): number {
  if (totals.length < 2) {
    return 0;
  }
  const mean = totals.reduce((sum, value) => sum + value, 0) / totals.length;
  if (mean === 0) {
    return 0;
  }
  return ((Math.max(...totals) - Math.min(...totals)) / Math.abs(mean)) * 100;
}

/**
 * "The two models are within 4 % of each other…" — null with < 2 results.
 */
export function agreementSentence(results: ForecastResult[]): string | null {
  if (results.length < 2) {
    return null;
  }
  const spread = spreadPct(
    results.map((result) => result.summary.horizonTotal),
  );
  const who = `The ${countWord(results.length)} models`;
  const pct = Math.max(1, Math.round(spread));

  if (spread < 5) {
    return `${who} are within ${pct} % of each other, so the outlook is fairly robust.`;
  }
  if (spread < 15) {
    return `${who} differ by ${pct} % — a reasonable spread; the Compare view shows where they diverge.`;
  }
  return `${who} disagree by ${pct} % — open Compare to see why before relying on a single number.`;
}

/**
 * One line for the Compare page recommending which number to plan with.
 */
export function compareRecommendation(results: ForecastResult[]): string {
  if (results.length === 0) {
    return "No forecasts to compare yet.";
  }
  if (results.length === 1) {
    return `Only ${results[0].modelName} ran — add another model for a cross-check.`;
  }

  const measured = results.filter((result) => result.accuracy !== null);
  const average =
    results.reduce((sum, result) => sum + result.summary.horizonTotal, 0) /
    results.length;

  if (measured.length === 0) {
    return `None of the models could be accuracy-tested yet; treat the average of the ${countWord(results.length)} (${formatCompactMoney(average)}) as a working number.`;
  }

  const ranked = [...measured].sort(
    (a, b) =>
      (typicalMissPct(a.accuracy) ?? 0) - (typicalMissPct(b.accuracy) ?? 0),
  );
  const best = ranked[0];
  const runnerUp = ranked[1];
  const bestMiss = typicalMissPct(best.accuracy) ?? 0;

  if (
    runnerUp &&
    Math.abs((typicalMissPct(runnerUp.accuracy) ?? 0) - bestMiss) < 1
  ) {
    return `${best.modelName} and ${runnerUp.modelName} have been similarly accurate on recent data; the average of the two (${formatCompactMoney(average)}) is a sensible planning number.`;
  }

  const others = results
    .filter((result) => result.modelId !== best.modelId)
    .map((result) => result.modelName);
  const crossCheck =
    others.length > 0
      ? ` ${joinNames(others)} ${others.length === 1 ? "is" : "are"} a useful cross-check.`
      : "";
  return `${best.modelName} has been the most accurate on recent data (${typicalMissPhrase(best.accuracy)}), so lean on it for planning.${crossCheck}`;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) {
    return names.join("");
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Analyst section — the one place jargon is allowed
// ---------------------------------------------------------------------------

export type AnalystMetric = {
  label: string;
  value: string;
  /** Plain-language sub-label. */
  hint: string;
};

function formatPct1(pct: number | null): string {
  return pct === null ? "—" : `${pct.toFixed(1)} %`;
}

export function analystMetrics(result: ForecastResult): AnalystMetric[] {
  const { accuracy } = result;
  const metrics: AnalystMetric[] = [];
  if (accuracy) {
    metrics.push(
      {
        label: "WAPE",
        value: formatPct1(accuracy.wapePct),
        hint: "Total miss over the test window, weighted by sales",
      },
      {
        label: "MAPE",
        value: formatPct1(accuracy.mapePct),
        hint: "Average daily miss on days with sales",
      },
      {
        label: "MAE",
        value: formatMoney(accuracy.mae),
        hint: "Average daily miss in euros",
      },
      {
        label: "Bias",
        value: formatSignedPct(accuracy.biasPct),
        hint:
          accuracy.biasPct > 0
            ? "Tends to forecast too high"
            : accuracy.biasPct < 0
              ? "Tends to forecast too low"
              : "No systematic lean",
      },
      {
        label: "80 % band coverage",
        value: formatPct1(accuracy.coverage80Pct),
        hint: "Share of test days that fell inside the likely range (ideal ≈ 80 %)",
      },
      {
        label: "Holdout",
        value: `${accuracy.holdoutDays} days · ${accuracy.folds} fold${accuracy.folds === 1 ? "" : "s"}`,
        hint: "Days held back from training to test the model",
      },
    );
  }
  metrics.push(
    {
      label: "Cutoff",
      value: formatDayLabel(result.cutoffDate, { year: true }),
      hint: "Last day of actual sales the forecast starts from",
    },
    {
      label: "Model version",
      value: `${result.modelVersion} · engine ${result.engineVersion}`,
      hint: "For reproducing this run",
    },
    {
      label: "Runtime",
      value: `${(result.runtimeMs / 1000).toFixed(1)} s`,
      hint: result.cached ? "Served from cache" : "Computed on request",
    },
  );
  return metrics;
}

export function analystSummaryLine(result: ForecastResult): string {
  const { accuracy } = result;
  const parts: string[] = [];
  if (accuracy) {
    parts.push(`WAPE ${formatPct1(accuracy.wapePct)}`);
    if (accuracy.mapePct !== null) {
      parts.push(`MAPE ${formatPct1(accuracy.mapePct)}`);
    }
    parts.push(`MAE ${formatMoney(accuracy.mae)}`);
    parts.push(`holdout ${accuracy.holdoutDays} d`);
  } else {
    parts.push("accuracy not measured");
  }
  parts.push(`cutoff ${result.cutoffDate}`);
  parts.push(`${(result.runtimeMs / 1000).toFixed(1)} s`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// KPI tiles (input for KpiStatCards)
// ---------------------------------------------------------------------------

export type KpiTile = { label: string; value: string; hint?: string | null };

export function kpiTiles(result: ForecastResult): KpiTile[] {
  const { summary, horizonDays } = result;
  const tiles: KpiTile[] = [
    {
      label: `Expected total · ${horizonPhrase(horizonDays).replace(/^the /, "")}`,
      value: formatCompactMoney(summary.horizonTotal),
      hint: `≈ ${formatCompactMoney(summary.averageDaily)} per day · likely ${formatCompactMoneyRange(summary.horizonLower80, summary.horizonUpper80)}`,
    },
  ];
  if (summary.vsLastYearPct !== null && summary.samePeriodLastYear !== null) {
    tiles.push({
      label: "vs same period last year",
      value: formatSignedPct(summary.vsLastYearPct),
      hint: `${formatCompactMoney(summary.samePeriodLastYear)} last year`,
    });
  }
  tiles.push({
    label: `vs ${trailingPhrase(horizonDays)}`,
    value: formatSignedPct(summary.vsTrailingPct),
    hint: `${formatCompactMoney(summary.trailingPeriodTotal)} in ${trailingPhrase(horizonDays)}`,
  });
  tiles.push({
    label: "Best / quietest day",
    value: formatDayLabel(summary.peakDay),
    hint: `${formatCompactMoney(summary.peakDayValue)} · quietest ${formatDayLabel(summary.lowDay)} (${formatCompactMoney(summary.lowDayValue)})`,
  });
  return tiles;
}

// ---------------------------------------------------------------------------
// Errors & warnings → friendly copy
// ---------------------------------------------------------------------------

export type FriendlyError = { title: string; message: string };

export function forecastErrorCopy(
  code: string,
  fallbackMessage?: string,
): FriendlyError {
  switch (code) {
    case "ENGINE_UNAVAILABLE":
    case "NOT_CONFIGURED":
      return {
        title: "The forecast service is unavailable",
        message:
          "We could not reach the forecasting service. It may be restarting — try again in a moment.",
      };
    case "ENGINE_TIMEOUT":
      return {
        title: "This forecast took too long",
        message:
          "The model did not finish in time. Try again; a shorter horizon usually completes faster.",
      };
    case "NO_SALES_DATA":
      return {
        title: "No sales data for this brand",
        message:
          "We could not find any recent sales for this brand in the warehouse, so there is nothing to forecast yet.",
      };
    case "INSUFFICIENT_HISTORY":
      return {
        title: "Not enough sales history yet",
        message:
          fallbackMessage ??
          "This model needs a longer sales history than the brand has so far.",
      };
    case "UNKNOWN_MODEL":
      return {
        title: "This model is no longer available",
        message: "Pick another model from the list above.",
      };
    case "ENGINE_REJECTED":
    case "INVALID_RESPONSE":
      return {
        title: "The forecast came back in an unexpected shape",
        message:
          "The forecasting service returned something we could not read. Try again; if it keeps happening, tell the data team.",
      };
    case "FORBIDDEN":
      return {
        title: "This brand is not assigned to you",
        message: "Choose one of your brands from the list above.",
      };
    case "BAD_REQUEST":
      return {
        title: "Something in the request was invalid",
        message: "Reload the page and try again.",
      };
    default:
      return {
        title: "Something went wrong",
        message:
          fallbackMessage ??
          "We could not produce this forecast. Try again in a moment.",
      };
  }
}

export function forecastWarningCopy(code: string, message: string): string {
  switch (code) {
    case "INSUFFICIENT_FOR_YEARLY":
      return "Less than about 13 months of history, so seasonal swings across the year are not modelled yet.";
    case "GAPS_FILLED":
      return "Some days had no recorded sales and were treated as zero.";
    case "CLOSURE_PERIOD":
      return "A stretch of consecutive zero-sales days looks like a closure and was set aside when fitting.";
    case "NEGATIVE_CLIPPED":
      return "A few days had negative totals (refunds); they were treated as zero.";
    case "OUTLIERS_DETECTED":
      return "Some unusually high or low days were spotted in the history; they may pull the forecast slightly.";
    case "HORIZON_LONG_FOR_HISTORY":
      return "This horizon is long relative to the available history, so the further-out days are less certain.";
    case "HOLIDAYS_UNAVAILABLE":
      return "Public-holiday effects could not be included in this run.";
    case "FALLBACK_MODEL_USED":
      return "The main method could not fit this series, so a simpler seasonal method was used instead.";
    default:
      return message;
  }
}

/** "{Brand} has 41 days of sales history; {Model} needs at least 60." */
export function insufficientHistorySentence(input: {
  brandName: string;
  modelName: string;
  historyDays: number | null;
  minHistoryDays: number;
}): string {
  const { brandName, modelName, historyDays, minHistoryDays } = input;
  const has =
    historyDays === null
      ? `${brandName} does not have enough sales history yet`
      : `${brandName} has ${historyDays} day${historyDays === 1 ? "" : "s"} of sales history`;
  return `${has}; ${modelName} needs at least ${minHistoryDays}.`;
}

/** Badge text for a model card: "Needs 60+ days". */
export function minHistoryBadge(
  model: Pick<ForecastModel, "minHistoryDays">,
): string {
  return `Needs ${model.minHistoryDays}+ days`;
}

/** Visually-hidden status sentence per card for screen readers. */
export function cardStatusSentence(
  modelName: string,
  status: "loading" | "ready" | "error",
  result?: ForecastResult,
): string {
  switch (status) {
    case "loading":
      return `${modelName} forecast is loading.`;
    case "ready":
      return result
        ? `${modelName} forecast ready. ${headlineSentence(result)}`
        : `${modelName} forecast ready.`;
    default:
      return `${modelName} forecast failed.`;
  }
}
