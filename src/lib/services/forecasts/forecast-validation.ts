import type {
  DailySalesPoint,
  ForecastModel,
  ForecastPoint,
  ForecastWarning,
} from "./forecast-types";

/**
 * Browser-safe maths for forecast validation runs: the dates a recorded
 * forecast covers, and the comparison of its daily points against the sales
 * that actually happened once the window has passed.
 *
 * Metrics and grade thresholds mirror the engine's backtest
 * (`forecast-service/forecast_service/backtest.py`) so a validation grade reads
 * the same as the "accuracy" card on the Forecasts pages:
 *
 *   WAPE      = Σ|yhat − y| / Σ|y| × 100
 *   bias      = Σ(yhat − y) / Σ|y| × 100   (positive = over-forecast)
 *   coverage  = share of days with lo80 ≤ y ≤ hi80
 *   quality   = high (WAPE ≤ 12) | medium (≤ 25) | low
 */

export const FORECAST_VALIDATION_GRADE_HIGH_WAPE = 12;
export const FORECAST_VALIDATION_GRADE_MEDIUM_WAPE = 25;

export const forecastValidationQualities = ["high", "medium", "low"] as const;
export type ForecastValidationQuality =
  (typeof forecastValidationQualities)[number];

export function gradeForWape(wapePct: number): ForecastValidationQuality {
  if (wapePct <= FORECAST_VALIDATION_GRADE_HIGH_WAPE) {
    return "high";
  }
  if (wapePct <= FORECAST_VALIDATION_GRADE_MEDIUM_WAPE) {
    return "medium";
  }
  return "low";
}

// ---------------------------------------------------------------------------
// Dates (UTC calendar arithmetic on ISO YYYY-MM-DD strings)
// ---------------------------------------------------------------------------

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function parseIsoDateUtc(iso: string): number {
  if (!ISO_DATE_PATTERN.test(iso)) {
    throw new Error(`Expected an ISO date (YYYY-MM-DD), got "${iso}"`);
  }
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function addDaysIso(iso: string, days: number): string {
  return new Date(parseIsoDateUtc(iso) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetweenIso(from: string, to: string): number {
  return Math.round((parseIsoDateUtc(to) - parseIsoDateUtc(from)) / DAY_MS);
}

export type ForecastValidationWindow = {
  /** First forecast day: cutoff + 1. */
  from: string;
  /** Last forecast day: cutoff + horizon. */
  to: string;
  /**
   * The day the evaluation sweep starts checking the run. Equal to `to` — the
   * sweep then waits until the warehouse has sales for that day.
   */
  evaluateAfter: string;
};

export function forecastValidationWindow(
  cutoffDate: string,
  horizonDays: number,
): ForecastValidationWindow {
  if (!Number.isInteger(horizonDays) || horizonDays < 1) {
    throw new Error(
      `horizonDays must be a positive integer, got ${horizonDays}`,
    );
  }
  const to = addDaysIso(cutoffDate, horizonDays);
  return { from: addDaysIso(cutoffDate, 1), to, evaluateAfter: to };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export type ForecastValidationPointInput = Pick<
  ForecastPoint,
  "ds" | "yhat" | "lo80" | "hi80"
>;

export type ForecastValidationComparedPoint = ForecastValidationPointInput & {
  /** Revenue on that day; 0 when the warehouse has no row for it. */
  actual: number;
  /** Whether the warehouse had a sales row for the day. */
  hasActual: boolean;
};

export type ForecastValidationComparison = {
  forecastTotal: number;
  actualTotal: number;
  /** Days in the window with a sales row (gaps count as 0 in the totals). */
  actualDays: number;
  /** actualTotal − forecastTotal (negative = the forecast was too high). */
  deviation: number;
  /** deviation / actualTotal × 100; null when there were no actual sales. */
  deviationPct: number | null;
  wapePct: number | null;
  biasPct: number | null;
  coverage80Pct: number | null;
  quality: ForecastValidationQuality | null;
  points: ForecastValidationComparedPoint[];
};

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Scores a recorded forecast against the daily sales of its window. Days the
 * warehouse has no row for count as zero sales (the engine zero-fills its
 * input the same way) and are reported through `actualDays` so a half-synced
 * window is visible. Extra actuals outside the forecast days are ignored.
 */
export function compareForecastToActuals(
  points: readonly ForecastValidationPointInput[],
  actuals: readonly Pick<DailySalesPoint, "ds" | "revenue">[],
): ForecastValidationComparison {
  const revenueByDay = new Map(actuals.map((row) => [row.ds, row.revenue]));

  let forecastTotal = 0;
  let actualTotal = 0;
  let actualDays = 0;
  let sumAbsError = 0;
  let sumError = 0;
  let sumAbsActual = 0;
  let insideBand = 0;

  const compared = points.map((point) => {
    const actual = revenueByDay.get(point.ds);
    const hasActual = actual !== undefined;
    const y = hasActual ? actual : 0;
    const error = point.yhat - y;

    forecastTotal += point.yhat;
    actualTotal += y;
    if (hasActual) {
      actualDays += 1;
    }
    sumAbsError += Math.abs(error);
    sumError += error;
    sumAbsActual += Math.abs(y);
    if (y >= point.lo80 && y <= point.hi80) {
      insideBand += 1;
    }

    return { ...point, actual: y, hasActual };
  });

  const scorable = sumAbsActual > 0;
  const wapePct = scorable
    ? round((sumAbsError / sumAbsActual) * 100, 2)
    : null;
  const biasPct = scorable ? round((sumError / sumAbsActual) * 100, 2) : null;
  const deviation = actualTotal - forecastTotal;

  return {
    forecastTotal: round(forecastTotal, 2),
    actualTotal: round(actualTotal, 2),
    actualDays,
    deviation: round(deviation, 2),
    deviationPct:
      actualTotal > 0 ? round((deviation / actualTotal) * 100, 2) : null,
    wapePct,
    biasPct,
    coverage80Pct:
      compared.length > 0
        ? round((insideBand / compared.length) * 100, 1)
        : null,
    quality: wapePct === null ? null : gradeForWape(wapePct),
    points: compared,
  };
}

// ---------------------------------------------------------------------------
// Recorded runs (browser-safe shape of the Postgres tables)
// ---------------------------------------------------------------------------

export const forecastValidationRunStatuses = [
  "pending",
  "evaluated",
  "skipped",
  "failed",
] as const;
export type ForecastValidationRunStatus =
  (typeof forecastValidationRunStatuses)[number];

export const forecastValidationStatusLabels: Record<
  ForecastValidationRunStatus,
  string
> = {
  pending: "Pending",
  evaluated: "Evaluated",
  skipped: "Skipped",
  failed: "Failed",
};

export const forecastValidationQualityLabels: Record<
  ForecastValidationQuality,
  string
> = { high: "High", medium: "Medium", low: "Low" };

export type ForecastValidationRunRow = {
  id: number;
  batchId: string;
  trigger: string;
  brandAlias: string;
  brandName: string;
  modelId: string;
  modelVersion: string;
  horizonDays: number;
  cutoffDate: string;
  forecastFrom: string;
  forecastTo: string;
  evaluateAfter: string;
  status: ForecastValidationRunStatus;
  forecastTotal: number;
  forecastLower80: number;
  forecastUpper80: number;
  backtestWapePct: number | null;
  backtestGrade: string | null;
  actualTotal: number | null;
  actualDays: number | null;
  deviation: number | null;
  deviationPct: number | null;
  wapePct: number | null;
  biasPct: number | null;
  coverage80Pct: number | null;
  quality: ForecastValidationQuality | null;
  evaluatedAt: string | null;
  error: string | null;
  createdAt: string;
};

export type ForecastValidationRunPoint = {
  ds: string;
  yhat: number;
  lo80: number;
  hi80: number;
  actual: number | null;
};

export type ForecastValidationRunDetail = ForecastValidationRunRow & {
  engineVersion: string;
  warnings: ForecastWarning[];
  points: ForecastValidationRunPoint[];
};

/** The columns the summary tiles, breakdowns and matrix need. */
export type ForecastValidationMetricRow = Pick<
  ForecastValidationRunRow,
  | "status"
  | "quality"
  | "wapePct"
  | "deviationPct"
  | "biasPct"
  | "coverage80Pct"
  | "evaluateAfter"
  | "cutoffDate"
  | "brandAlias"
  | "brandName"
  | "modelId"
  | "horizonDays"
  | "batchId"
>;

export type ForecastValidationPaginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

// ---------------------------------------------------------------------------
// URL filters of /forecasts/validation
// ---------------------------------------------------------------------------

export const forecastValidationGroupByOptions = [
  "model",
  "brand",
  "horizon",
  "batch",
] as const;
export type ForecastValidationGroupBy =
  (typeof forecastValidationGroupByOptions)[number];

export const forecastValidationGroupByLabels: Record<
  ForecastValidationGroupBy,
  string
> = {
  model: "By model",
  brand: "By brand",
  horizon: "By horizon",
  batch: "By batch",
};

export const forecastValidationSortFields = [
  "cutoff",
  "wape",
  "deviation",
  "brand",
  "model",
] as const;
export type ForecastValidationSortField =
  (typeof forecastValidationSortFields)[number];
export type ForecastValidationSortDir = "asc" | "desc";

export type ForecastValidationFilters = {
  /** Brand alias, lowercased; null = every brand in scope. */
  brand: string | null;
  model: string | null;
  horizon: number | null;
  status: ForecastValidationRunStatus | null;
  quality: ForecastValidationQuality | null;
  batch: string | null;
  group: ForecastValidationGroupBy;
  page: number;
  sort: ForecastValidationSortField;
  dir: ForecastValidationSortDir;
};

export const defaultForecastValidationFilters: ForecastValidationFilters = {
  brand: null,
  model: null,
  horizon: null,
  status: null,
  quality: null,
  batch: null,
  group: "model",
  page: 1,
  sort: "cutoff",
  dir: "desc",
};

/** Newest first for dates, best (lowest) first for WAPE, A-Z otherwise. */
export function defaultForecastValidationSortDir(
  sort: ForecastValidationSortField,
): ForecastValidationSortDir {
  return sort === "cutoff" ? "desc" : "asc";
}

const BATCH_ID_PATTERN = /^[0-9a-f-]{1,64}$/i;

function oneOf<T extends string>(
  value: string | null,
  options: readonly T[],
): T | null {
  return value !== null && (options as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

export function parseForecastValidationFilters(
  searchParams: URLSearchParams,
): ForecastValidationFilters {
  const text = (name: string, max = 64): string | null => {
    const raw = searchParams.get(name)?.trim() ?? "";
    return raw.length > 0 && raw.length <= max ? raw : null;
  };

  const rawHorizon = Number.parseInt(searchParams.get("horizon") ?? "", 10);
  const horizon =
    Number.isInteger(rawHorizon) && rawHorizon >= 1 && rawHorizon <= 90
      ? rawHorizon
      : null;

  const rawPage = Number.parseInt(searchParams.get("page") ?? "", 10);
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  const rawBatch = text("batch");
  const batch =
    rawBatch !== null && BATCH_ID_PATTERN.test(rawBatch) ? rawBatch : null;

  const sort =
    oneOf(searchParams.get("sort"), forecastValidationSortFields) ?? "cutoff";
  const dir =
    oneOf(searchParams.get("dir"), ["asc", "desc"] as const) ??
    defaultForecastValidationSortDir(sort);

  return {
    brand: text("brand")?.toLowerCase() ?? null,
    model: text("model"),
    horizon,
    status: oneOf(searchParams.get("status"), forecastValidationRunStatuses),
    quality: oneOf(searchParams.get("quality"), forecastValidationQualities),
    batch,
    group:
      oneOf(searchParams.get("group"), forecastValidationGroupByOptions) ??
      "model",
    page,
    sort,
    dir,
  };
}

/** Builds a link, leaving out every default so URLs stay short. */
export function buildForecastValidationHref(
  basePath: string,
  filters: ForecastValidationFilters,
): string {
  const params = new URLSearchParams();
  if (filters.brand) params.set("brand", filters.brand);
  if (filters.model) params.set("model", filters.model);
  if (filters.horizon !== null) params.set("horizon", String(filters.horizon));
  if (filters.status) params.set("status", filters.status);
  if (filters.quality) params.set("quality", filters.quality);
  if (filters.batch) params.set("batch", filters.batch);
  if (filters.group !== "model") params.set("group", filters.group);
  if (filters.sort !== "cutoff") params.set("sort", filters.sort);
  if (filters.dir !== defaultForecastValidationSortDir(filters.sort)) {
    params.set("dir", filters.dir);
  }
  if (filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query.length > 0 ? `${basePath}?${query}` : basePath;
}

// ---------------------------------------------------------------------------
// Aggregations for the tiles, breakdown table and model-by-brand matrix
// ---------------------------------------------------------------------------

export type ForecastValidationQualityCounts = {
  high: number;
  medium: number;
  low: number;
};

export type ForecastValidationSummary = {
  total: number;
  pending: number;
  evaluated: number;
  skipped: number;
  failed: number;
  /** Earliest `evaluateAfter` among pending runs. */
  nextDue: string | null;
  meanWapePct: number | null;
  meanAbsDeviationPct: number | null;
  meanBiasPct: number | null;
  meanCoverage80Pct: number | null;
  qualityCounts: ForecastValidationQualityCounts;
};

function mean(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) {
    return null;
  }
  return round(
    present.reduce((sum, value) => sum + value, 0) / present.length,
    1,
  );
}

function isEvaluated(row: ForecastValidationMetricRow): boolean {
  return row.status === "evaluated";
}

function qualityCounts(
  rows: readonly ForecastValidationMetricRow[],
): ForecastValidationQualityCounts {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const row of rows) {
    if (row.quality) {
      counts[row.quality] += 1;
    }
  }
  return counts;
}

function metricsOf(rows: readonly ForecastValidationMetricRow[]) {
  const evaluated = rows.filter(isEvaluated);
  return {
    evaluated: evaluated.length,
    meanWapePct: mean(evaluated.map((row) => row.wapePct)),
    meanAbsDeviationPct: mean(
      evaluated.map((row) =>
        row.deviationPct === null ? null : Math.abs(row.deviationPct),
      ),
    ),
    meanBiasPct: mean(evaluated.map((row) => row.biasPct)),
    meanCoverage80Pct: mean(evaluated.map((row) => row.coverage80Pct)),
    qualityCounts: qualityCounts(evaluated),
  };
}

export function summarizeValidationRuns(
  rows: readonly ForecastValidationMetricRow[],
): ForecastValidationSummary {
  const pending = rows.filter((row) => row.status === "pending");
  const nextDue = pending.reduce<string | null>(
    (min, row) =>
      min === null || row.evaluateAfter < min ? row.evaluateAfter : min,
    null,
  );
  return {
    total: rows.length,
    pending: pending.length,
    skipped: rows.filter((row) => row.status === "skipped").length,
    failed: rows.filter((row) => row.status === "failed").length,
    nextDue,
    ...metricsOf(rows),
  };
}

export type ForecastValidationGroupRow = {
  key: string;
  label: string;
  runs: number;
  evaluated: number;
  pending: number;
  meanWapePct: number | null;
  meanAbsDeviationPct: number | null;
  meanBiasPct: number | null;
  meanCoverage80Pct: number | null;
  qualityCounts: ForecastValidationQualityCounts;
  /** Model with the lowest mean WAPE inside the group (brand/horizon/batch groups). */
  bestModelId: string | null;
  bestModelWapePct: number | null;
};

type ModelLabel = Pick<ForecastModel, "id" | "name">;

export function forecastModelName(
  modelId: string,
  catalog: readonly ModelLabel[],
): string {
  return catalog.find((model) => model.id === modelId)?.name ?? modelId;
}

function groupKey(
  row: ForecastValidationMetricRow,
  groupBy: ForecastValidationGroupBy,
): string {
  switch (groupBy) {
    case "model":
      return row.modelId;
    case "brand":
      return row.brandAlias;
    case "horizon":
      return String(row.horizonDays);
    case "batch":
      return row.batchId;
  }
}

function groupLabel(
  rows: readonly ForecastValidationMetricRow[],
  groupBy: ForecastValidationGroupBy,
  catalog: readonly ModelLabel[],
): string {
  const first = rows[0];
  switch (groupBy) {
    case "model":
      return forecastModelName(first.modelId, catalog);
    case "brand":
      return first.brandName || first.brandAlias;
    case "horizon":
      return `${first.horizonDays} days`;
    case "batch": {
      const cutoff = rows.reduce(
        (max, row) => (row.cutoffDate > max ? row.cutoffDate : max),
        first.cutoffDate,
      );
      return `${cutoff} - ${first.batchId.slice(0, 8)}`;
    }
  }
}

function bestModel(rows: readonly ForecastValidationMetricRow[]): {
  modelId: string | null;
  wapePct: number | null;
} {
  const byModel = new Map<string, ForecastValidationMetricRow[]>();
  for (const row of rows) {
    if (!isEvaluated(row) || row.wapePct === null) continue;
    const list = byModel.get(row.modelId);
    if (list) list.push(row);
    else byModel.set(row.modelId, [row]);
  }
  let best: { modelId: string | null; wapePct: number | null } = {
    modelId: null,
    wapePct: null,
  };
  for (const [modelId, modelRows] of byModel) {
    const wape = mean(modelRows.map((row) => row.wapePct));
    if (wape !== null && (best.wapePct === null || wape < best.wapePct)) {
      best = { modelId, wapePct: wape };
    }
  }
  return best;
}

/**
 * One row per group, best mean WAPE first; groups with nothing evaluated yet
 * go last (most runs first among them).
 */
export function groupValidationRuns(
  rows: readonly ForecastValidationMetricRow[],
  groupBy: ForecastValidationGroupBy,
  catalog: readonly ModelLabel[],
): ForecastValidationGroupRow[] {
  const groups = new Map<string, ForecastValidationMetricRow[]>();
  for (const row of rows) {
    const key = groupKey(row, groupBy);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const result: ForecastValidationGroupRow[] = [];
  for (const [key, groupRows] of groups) {
    const best = groupBy === "model" ? null : bestModel(groupRows);
    result.push({
      key,
      label: groupLabel(groupRows, groupBy, catalog),
      runs: groupRows.length,
      pending: groupRows.filter((row) => row.status === "pending").length,
      ...metricsOf(groupRows),
      bestModelId: best?.modelId ?? null,
      bestModelWapePct: best?.wapePct ?? null,
    });
  }

  return result.sort((a, b) => {
    if (a.meanWapePct !== null && b.meanWapePct !== null) {
      return a.meanWapePct - b.meanWapePct || a.label.localeCompare(b.label);
    }
    if (a.meanWapePct !== null) return -1;
    if (b.meanWapePct !== null) return 1;
    return b.runs - a.runs || a.label.localeCompare(b.label);
  });
}

export type ForecastValidationMatrixCell = {
  meanWapePct: number | null;
  evaluated: number;
  quality: ForecastValidationQuality | null;
};

export type ForecastValidationMatrix = {
  brands: { alias: string; name: string }[];
  models: ModelLabel[];
  /** `cells[brandAlias][modelId]` */
  cells: Record<string, Record<string, ForecastValidationMatrixCell>>;
  bestModelByBrand: Record<string, string | null>;
};

/** Mean WAPE per brand and model over evaluated runs; models in catalog order. */
export function validationMatrix(
  rows: readonly ForecastValidationMetricRow[],
  catalog: readonly ModelLabel[],
): ForecastValidationMatrix {
  const brandByAlias = new Map<string, string>();
  const modelIds = new Set<string>();
  for (const row of rows) {
    brandByAlias.set(row.brandAlias, row.brandName || row.brandAlias);
    modelIds.add(row.modelId);
  }

  const catalogIds = catalog.map((model) => model.id);
  const models: ModelLabel[] = [
    ...catalog.filter((model) => modelIds.has(model.id)),
    ...[...modelIds]
      .filter((id) => !catalogIds.includes(id))
      .sort()
      .map((id) => ({ id, name: id })),
  ];
  const brands = [...brandByAlias]
    .map(([alias, name]) => ({ alias, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const cells: ForecastValidationMatrix["cells"] = {};
  const bestModelByBrand: ForecastValidationMatrix["bestModelByBrand"] = {};
  for (const brand of brands) {
    const brandRows = rows.filter((row) => row.brandAlias === brand.alias);
    cells[brand.alias] = {};
    for (const model of models) {
      const evaluated = brandRows.filter(
        (row) => row.modelId === model.id && isEvaluated(row),
      );
      const meanWapePct = mean(evaluated.map((row) => row.wapePct));
      cells[brand.alias][model.id] = {
        meanWapePct,
        evaluated: evaluated.length,
        quality: meanWapePct === null ? null : gradeForWape(meanWapePct),
      };
    }
    bestModelByBrand[brand.alias] = bestModel(brandRows).modelId;
  }

  return { brands, models, cells, bestModelByBrand };
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** "12.3 %" or a dash. */
export function formatPct(
  value: number | null | undefined,
  digits = 1,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${value.toFixed(digits)} %`;
}
