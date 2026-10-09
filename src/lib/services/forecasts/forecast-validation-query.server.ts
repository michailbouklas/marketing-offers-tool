import { prisma } from "$lib/server/prisma";
import type { Prisma } from "../../../generated/prisma/client";
import type { ForecastWarning } from "./forecast-types";
import {
  type ForecastValidationFilters,
  type ForecastValidationMetricRow,
  type ForecastValidationPaginated,
  type ForecastValidationRunDetail,
  type ForecastValidationRunRow,
  type ForecastValidationSortDir,
  type ForecastValidationSortField,
} from "./forecast-validation";
import { fromDbDate } from "./forecast-validation.server";

/**
 * Read side of forecast validation for `/forecasts/validation`: paginated
 * runs, the lightweight metric rows the tiles / breakdowns aggregate in the
 * browser-safe module, the filter facets, and one run with its daily points.
 *
 * Every query is scoped to the caller's brand aliases (`listScopedBrands`
 * parity): an empty scope returns nothing without touching the database.
 */

export const FORECAST_VALIDATION_PAGE_SIZE = 25;
/** Upper bound on rows aggregated for the tiles / breakdowns. */
export const FORECAST_VALIDATION_METRIC_ROW_CAP = 20_000;
const FACET_BATCH_LIMIT = 30;

type RunRecord = Prisma.forecast_validation_runGetPayload<object>;
type RunWithPoints = Prisma.forecast_validation_runGetPayload<{
  include: { points: true };
}>;

export function toRunRow(record: RunRecord): ForecastValidationRunRow {
  return {
    id: record.id,
    batchId: record.batch_id,
    trigger: record.trigger,
    brandAlias: record.brand_alias,
    brandName: record.brand_name,
    modelId: record.model_id,
    modelVersion: record.model_version,
    horizonDays: record.horizon_days,
    cutoffDate: fromDbDate(record.cutoff_date),
    forecastFrom: fromDbDate(record.forecast_from),
    forecastTo: fromDbDate(record.forecast_to),
    evaluateAfter: fromDbDate(record.evaluate_after),
    status: record.status,
    forecastTotal: record.forecast_total,
    forecastLower80: record.forecast_lower80,
    forecastUpper80: record.forecast_upper80,
    backtestWapePct: record.backtest_wape_pct,
    backtestGrade: record.backtest_grade,
    actualTotal: record.actual_total,
    actualDays: record.actual_days,
    deviation: record.deviation,
    deviationPct: record.deviation_pct,
    wapePct: record.wape_pct,
    biasPct: record.bias_pct,
    coverage80Pct: record.coverage80_pct,
    quality:
      record.quality === "high" ||
      record.quality === "medium" ||
      record.quality === "low"
        ? record.quality
        : null,
    evaluatedAt: record.evaluated_at?.toISOString() ?? null,
    error: record.error,
    createdAt: record.created_at.toISOString(),
  };
}

function toWarnings(value: Prisma.JsonValue): ForecastWarning[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (
      entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      typeof entry.code === "string" &&
      typeof entry.message === "string"
    ) {
      const details =
        entry.details &&
        typeof entry.details === "object" &&
        !Array.isArray(entry.details)
          ? (entry.details as Record<string, unknown>)
          : {};
      return [{ code: entry.code, message: entry.message, details }];
    }
    return [];
  });
}

export function toRunDetail(
  record: RunWithPoints,
): ForecastValidationRunDetail {
  return {
    ...toRunRow(record),
    engineVersion: record.engine_version,
    warnings: toWarnings(record.warnings),
    points: record.points.map((point) => ({
      ds: fromDbDate(point.ds),
      yhat: point.yhat,
      lo80: point.lo80,
      hi80: point.hi80,
      actual: point.actual,
    })),
  };
}

type ScopedQuery = { brandAliases: readonly string[] };

type FilterInput = Pick<
  ForecastValidationFilters,
  "brand" | "model" | "horizon" | "status" | "quality" | "batch"
>;

function buildWhere(
  scope: ScopedQuery,
  filters: FilterInput,
): Prisma.forecast_validation_runWhereInput {
  const and: Prisma.forecast_validation_runWhereInput[] = [
    { brand_alias: { in: [...scope.brandAliases] } },
  ];
  if (filters.brand) {
    and.push({ brand_alias: { equals: filters.brand, mode: "insensitive" } });
  }
  if (filters.model) {
    and.push({ model_id: filters.model });
  }
  if (filters.horizon !== null) {
    and.push({ horizon_days: filters.horizon });
  }
  if (filters.status) {
    and.push({ status: filters.status });
  }
  if (filters.quality) {
    and.push({ quality: filters.quality });
  }
  if (filters.batch) {
    and.push({ batch_id: filters.batch });
  }
  return { AND: and };
}

function orderBy(
  sort: ForecastValidationSortField,
  dir: ForecastValidationSortDir,
): Prisma.forecast_validation_runOrderByWithRelationInput[] {
  switch (sort) {
    case "wape":
      return [{ wape_pct: { sort: dir, nulls: "last" } }, { id: "desc" }];
    case "deviation":
      return [{ deviation_pct: { sort: dir, nulls: "last" } }, { id: "desc" }];
    case "brand":
      return [{ brand_alias: dir }, { cutoff_date: "desc" }, { id: "desc" }];
    case "model":
      return [{ model_id: dir }, { cutoff_date: "desc" }, { id: "desc" }];
    case "cutoff":
    default:
      return [{ cutoff_date: dir }, { id: dir }];
  }
}

export async function listForecastValidationRuns(
  options: ScopedQuery & {
    filters: ForecastValidationFilters;
    pageSize?: number;
  },
): Promise<ForecastValidationPaginated<ForecastValidationRunRow>> {
  const pageSize = options.pageSize ?? FORECAST_VALIDATION_PAGE_SIZE;
  const page = Math.max(1, options.filters.page);

  if (options.brandAliases.length === 0) {
    return { items: [], page: 1, pageSize, totalItems: 0, totalPages: 1 };
  }

  const where = buildWhere(options, options.filters);
  const [totalItems, records] = await Promise.all([
    prisma.forecast_validation_run.count({ where }),
    prisma.forecast_validation_run.findMany({
      where,
      orderBy: orderBy(options.filters.sort, options.filters.dir),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: records.map(toRunRow),
    page,
    pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
  };
}

/** Rows for the tiles / breakdowns: same filters as the table, no paging. */
export async function listForecastValidationMetricRows(
  options: ScopedQuery & { filters: FilterInput },
): Promise<ForecastValidationMetricRow[]> {
  if (options.brandAliases.length === 0) {
    return [];
  }

  const records = await prisma.forecast_validation_run.findMany({
    where: buildWhere(options, options.filters),
    orderBy: [{ cutoff_date: "desc" }, { id: "desc" }],
    take: FORECAST_VALIDATION_METRIC_ROW_CAP,
    select: {
      status: true,
      quality: true,
      wape_pct: true,
      deviation_pct: true,
      bias_pct: true,
      coverage80_pct: true,
      evaluate_after: true,
      cutoff_date: true,
      brand_alias: true,
      brand_name: true,
      model_id: true,
      horizon_days: true,
      batch_id: true,
    },
  });

  return records.map((record) => ({
    status: record.status,
    quality:
      record.quality === "high" ||
      record.quality === "medium" ||
      record.quality === "low"
        ? record.quality
        : null,
    wapePct: record.wape_pct,
    deviationPct: record.deviation_pct,
    biasPct: record.bias_pct,
    coverage80Pct: record.coverage80_pct,
    evaluateAfter: fromDbDate(record.evaluate_after),
    cutoffDate: fromDbDate(record.cutoff_date),
    brandAlias: record.brand_alias,
    brandName: record.brand_name,
    modelId: record.model_id,
    horizonDays: record.horizon_days,
    batchId: record.batch_id,
  }));
}

export type ForecastValidationFacets = {
  brands: { alias: string; name: string }[];
  modelIds: string[];
  horizons: number[];
  /** Most recent batches first. */
  batches: {
    batchId: string;
    cutoffDate: string;
    createdAt: string;
    runs: number;
  }[];
};

export async function listForecastValidationFacets(
  scope: ScopedQuery,
): Promise<ForecastValidationFacets> {
  if (scope.brandAliases.length === 0) {
    return { brands: [], modelIds: [], horizons: [], batches: [] };
  }

  const where = buildWhere(scope, {
    brand: null,
    model: null,
    horizon: null,
    status: null,
    quality: null,
    batch: null,
  });

  const [brands, models, horizons, batches] = await Promise.all([
    prisma.forecast_validation_run.groupBy({
      by: ["brand_alias", "brand_name"],
      where,
      orderBy: [{ brand_name: "asc" }, { brand_alias: "asc" }],
    }),
    prisma.forecast_validation_run.groupBy({
      by: ["model_id"],
      where,
      orderBy: { model_id: "asc" },
    }),
    prisma.forecast_validation_run.groupBy({
      by: ["horizon_days"],
      where,
      orderBy: { horizon_days: "asc" },
    }),
    prisma.forecast_validation_run.groupBy({
      by: ["batch_id"],
      where,
      _count: { _all: true },
      _max: { cutoff_date: true, created_at: true },
      orderBy: { _max: { created_at: "desc" } },
      take: FACET_BATCH_LIMIT,
    }),
  ]);

  // A brand renamed between batches would appear twice; keep the latest name.
  const brandByAlias = new Map<string, string>();
  for (const brand of brands) {
    brandByAlias.set(brand.brand_alias, brand.brand_name);
  }

  return {
    brands: [...brandByAlias]
      .map(([alias, name]) => ({ alias, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    modelIds: models.map((model) => model.model_id),
    horizons: horizons.map((row) => row.horizon_days),
    batches: batches.map((batch) => ({
      batchId: batch.batch_id,
      cutoffDate: batch._max.cutoff_date
        ? fromDbDate(batch._max.cutoff_date)
        : "",
      createdAt: batch._max.created_at?.toISOString() ?? "",
      runs: batch._count._all,
    })),
  };
}

/** One run with its points, or null when unknown or outside the scope. */
export async function getForecastValidationRun(
  id: number,
  scope: ScopedQuery,
): Promise<ForecastValidationRunDetail | null> {
  if (!Number.isSafeInteger(id) || id <= 0 || scope.brandAliases.length === 0) {
    return null;
  }

  const record = await prisma.forecast_validation_run.findFirst({
    where: { id, brand_alias: { in: [...scope.brandAliases] } },
    include: { points: { orderBy: { ds: "asc" } } },
  });

  return record ? toRunDetail(record) : null;
}

/** The other models recorded for the same brand, horizon and batch. */
export async function listSiblingForecastValidationRuns(
  run: Pick<
    ForecastValidationRunRow,
    "id" | "batchId" | "brandAlias" | "horizonDays"
  >,
): Promise<ForecastValidationRunRow[]> {
  const records = await prisma.forecast_validation_run.findMany({
    where: {
      batch_id: run.batchId,
      brand_alias: run.brandAlias,
      horizon_days: run.horizonDays,
      id: { not: run.id },
    },
    orderBy: { model_id: "asc" },
  });
  return records.map(toRunRow);
}

export type ForecastValidationLatestBatch = {
  batchId: string;
  createdAt: string;
  runs: number;
};

/** Newest batch overall (admin status card; not brand-scoped). */
export async function getLatestForecastValidationBatch(): Promise<ForecastValidationLatestBatch | null> {
  const latest = await prisma.forecast_validation_run.findFirst({
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select: { batch_id: true, created_at: true },
  });
  if (!latest) {
    return null;
  }
  const runs = await prisma.forecast_validation_run.count({
    where: { batch_id: latest.batch_id },
  });
  return {
    batchId: latest.batch_id,
    createdAt: latest.created_at.toISOString(),
    runs,
  };
}
