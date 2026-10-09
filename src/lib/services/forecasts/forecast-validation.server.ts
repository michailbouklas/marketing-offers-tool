import { randomUUID } from "node:crypto";
import { getForecastValidationEnv } from "$lib/server/env";
import { tryAcquireAdvisoryLock } from "$lib/server/pg-advisory-lock";
import { prisma } from "$lib/server/prisma";
import { listBrands } from "$lib/services/brands.server";
import type { Prisma } from "../../../generated/prisma/client";
import { isForecastError, listForecastModels } from "./forecast-engine.server";
import { getForecastForBrand } from "./forecast-run.server";
import {
  getDailySalesSeries,
  getLatestSalesDate,
} from "./forecast-series.server";
import type { ForecastModel } from "./forecast-types";
import {
  compareForecastToActuals,
  daysBetweenIso,
  forecastValidationWindow,
  type ForecastValidationQuality,
} from "./forecast-validation";

/**
 * Forecast validation: record what every model predicts for every brand over
 * an N-day window, then (once that window has passed and the warehouse has
 * every day of it) score the prediction against the sales that happened.
 *
 * Two entry points, both serialised across processes by Postgres advisory
 * locks:
 *
 * - `recordForecastValidationRuns` (CLI `bun run forecast:validate`): one
 *   `forecast_validation_run` (+ daily points) per brand x model, status
 *   `pending`, `evaluate_after` = last forecast day. Brands the engine cannot
 *   forecast (no sales, too little history) are stored as `skipped`, engine
 *   failures as `failed`, so the gap is visible in the table.
 * - `evaluateDueForecastValidationRuns` (daily croner sweep in
 *   `scheduler.server.ts`, or `bun run forecast:validate evaluate`): every
 *   pending run whose `evaluate_after` has arrived is compared with
 *   ClickHouse actuals as soon as the latest sales date of the brand reaches
 *   the end of the window; runs still waiting after
 *   `FORECAST_VALIDATION_MAX_LAG_DAYS` are marked `failed`.
 */

export type ForecastValidationTrigger = "cli" | "cron" | "manual";

export type ForecastValidationRecordOutcome = {
  brandAlias: string;
  modelId: string;
  status: "recorded" | "duplicate" | "skipped" | "failed";
  cutoffDate: string | null;
  forecastTotal: number | null;
  error: string | null;
};

export type ForecastValidationRecordSummary = {
  batchId: string;
  trigger: ForecastValidationTrigger;
  dryRun: boolean;
  horizonDays: number;
  brands: string[];
  models: string[];
  recorded: number;
  duplicates: number;
  skipped: number;
  failed: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  outcomes: ForecastValidationRecordOutcome[];
};

export type ForecastValidationRecordResult =
  | { status: "ran"; summary: ForecastValidationRecordSummary }
  | { status: "skipped"; reason: string };

export type ForecastValidationEvaluateOutcome = {
  runId: number;
  brandAlias: string;
  modelId: string;
  status: "evaluated" | "waiting" | "failed" | "error";
  quality: ForecastValidationQuality | null;
  wapePct: number | null;
  deviationPct: number | null;
  reason: string | null;
};

export type ForecastValidationEvaluateSummary = {
  trigger: ForecastValidationTrigger;
  dryRun: boolean;
  /** The calendar day (UTC) the sweep ran as. */
  asOf: string;
  due: number;
  evaluated: number;
  waiting: number;
  failed: number;
  /** Runs left pending because a warehouse query failed. */
  errors: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  outcomes: ForecastValidationEvaluateOutcome[];
};

export type ForecastValidationEvaluateResult =
  | { status: "ran"; summary: ForecastValidationEvaluateSummary }
  | { status: "skipped"; reason: string };

/** Bad caller input (unknown brand/model, horizon out of range): CLI exit 2. */
export class ForecastValidationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForecastValidationInputError";
  }
}

/** The engine accepts 1..90 (`schemas.py`: `horizon_days ... ge=1, le=90`). */
export const FORECAST_VALIDATION_MIN_HORIZON_DAYS = 1;
export const FORECAST_VALIDATION_MAX_HORIZON_DAYS = 90;

// Two arbitrary int4 pairs identifying the cross-process locks.
const RECORD_LOCK_KEY_1 = 0x4663_5661 | 0; // "FcVa"
const RECORD_LOCK_KEY_2 = 0x5265_6364 | 0; // "Recd"
const EVALUATE_LOCK_KEY_1 = 0x4663_5661 | 0; // "FcVa"
const EVALUATE_LOCK_KEY_2 = 0x4576_616c | 0; // "Eval"
const TRANSACTION_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Date helpers: Prisma `@db.Date` columns round-trip as UTC-midnight Dates
// ---------------------------------------------------------------------------

export function toDbDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function errorMessage(error: unknown): string {
  if (isForecastError(error)) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await fn(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

type ValidationBrand = { alias: string; name: string };

async function resolveBrands(
  requested: string[] | undefined,
): Promise<ValidationBrand[]> {
  const active = (await listBrands({ active: true }))
    .map((brand) => ({ alias: brand.alias.trim(), name: brand.name.trim() }))
    .filter((brand) => brand.alias.length > 0);

  if (!requested || requested.length === 0) {
    return active;
  }

  const wanted = [
    ...new Set(
      requested.map((alias) => alias.trim().toLowerCase()).filter(Boolean),
    ),
  ];
  const byAlias = new Map(
    active.map((brand) => [brand.alias.toLowerCase(), brand]),
  );
  const unknown = wanted.filter((alias) => !byAlias.has(alias));

  if (unknown.length > 0) {
    throw new ForecastValidationInputError(
      `Unknown or inactive brand alias(es): ${unknown.join(", ")}. Active aliases: ${active
        .map((brand) => brand.alias)
        .join(", ")}.`,
    );
  }

  return active.filter((brand) => wanted.includes(brand.alias.toLowerCase()));
}

async function resolveModels(
  requested: string[] | undefined,
  now: number,
): Promise<ForecastModel[]> {
  const catalog = await listForecastModels({ now });

  if (!requested || requested.length === 0) {
    return catalog;
  }

  const wanted = [...new Set(requested.map((id) => id.trim()).filter(Boolean))];
  const known = new Set(catalog.map((model) => model.id));
  const unknown = wanted.filter((id) => !known.has(id));

  if (unknown.length > 0) {
    throw new ForecastValidationInputError(
      `Unknown forecast model id(s): ${unknown.join(", ")}. Catalog: ${catalog
        .map((model) => model.id)
        .join(", ")}.`,
    );
  }

  return catalog.filter((model) => wanted.includes(model.id));
}

type RecordPairContext = {
  batchId: string;
  trigger: ForecastValidationTrigger;
  horizonDays: number;
  dryRun: boolean;
  now: Date;
};

/**
 * Stores a `skipped` / `failed` marker for a pair the engine could not
 * forecast. The cutoff is unknown in that case, so the row is keyed on today;
 * a real run recorded later with the same cutoff replaces it, and a repeat
 * failure the same day updates it in place.
 */
async function writePlaceholderRun(
  brand: ValidationBrand,
  model: ForecastModel,
  context: RecordPairContext,
  status: "skipped" | "failed",
  error: string,
): Promise<void> {
  const cutoff = todayIso(context.now);
  const window = forecastValidationWindow(cutoff, context.horizonDays);
  const key = {
    brand_alias: brand.alias,
    model_id: model.id,
    horizon_days: context.horizonDays,
    cutoff_date: toDbDate(cutoff),
  };
  const existing = await prisma.forecast_validation_run.findUnique({
    where: { brand_alias_model_id_horizon_days_cutoff_date: key },
    select: { id: true, status: true },
  });

  if (
    existing &&
    existing.status !== "skipped" &&
    existing.status !== "failed"
  ) {
    return;
  }

  const marker = {
    batch_id: context.batchId,
    trigger: context.trigger,
    status,
    error,
    created_at: context.now,
  };

  if (existing) {
    await prisma.forecast_validation_run.update({
      where: { id: existing.id },
      data: marker,
    });
    return;
  }

  await prisma.forecast_validation_run.create({
    data: {
      ...key,
      ...marker,
      brand_name: brand.name,
      model_version: model.version,
      engine_version: "",
      forecast_from: toDbDate(window.from),
      forecast_to: toDbDate(window.to),
      evaluate_after: toDbDate(window.evaluateAfter),
      forecast_total: 0,
      forecast_lower80: 0,
      forecast_upper80: 0,
      warnings: [],
    },
  });
}

async function recordPair(
  brand: ValidationBrand,
  model: ForecastModel,
  context: RecordPairContext,
): Promise<ForecastValidationRecordOutcome> {
  const base = { brandAlias: brand.alias, modelId: model.id };

  try {
    const result = await getForecastForBrand(
      {
        brandAlias: brand.alias,
        brandName: brand.name,
        modelId: model.id,
        horizonDays: context.horizonDays,
      },
      { now: context.now.getTime() },
    );
    const window = forecastValidationWindow(
      result.cutoffDate,
      context.horizonDays,
    );
    const key = {
      brand_alias: brand.alias,
      model_id: model.id,
      horizon_days: context.horizonDays,
      cutoff_date: toDbDate(result.cutoffDate),
    };
    const existing = await prisma.forecast_validation_run.findUnique({
      where: { brand_alias_model_id_horizon_days_cutoff_date: key },
      select: { id: true, status: true },
    });

    if (
      existing &&
      (existing.status === "pending" || existing.status === "evaluated")
    ) {
      return {
        ...base,
        status: "duplicate",
        cutoffDate: result.cutoffDate,
        forecastTotal: result.summary.horizonTotal,
        error: null,
      };
    }

    if (!context.dryRun) {
      await prisma.$transaction(
        async (tx) => {
          if (existing) {
            await tx.forecast_validation_run.delete({
              where: { id: existing.id },
            });
          }

          const run = await tx.forecast_validation_run.create({
            data: {
              ...key,
              batch_id: context.batchId,
              trigger: context.trigger,
              brand_name: brand.name,
              model_version: result.modelVersion,
              engine_version: result.engineVersion,
              forecast_from: toDbDate(window.from),
              forecast_to: toDbDate(window.to),
              evaluate_after: toDbDate(window.evaluateAfter),
              status: "pending",
              forecast_total: result.summary.horizonTotal,
              forecast_lower80: result.summary.horizonLower80,
              forecast_upper80: result.summary.horizonUpper80,
              backtest_wape_pct: result.accuracy?.wapePct ?? null,
              backtest_grade: result.accuracy?.grade ?? null,
              warnings: result.warnings as unknown as Prisma.InputJsonValue,
              created_at: context.now,
            },
          });

          if (result.forecast.length > 0) {
            await tx.forecast_validation_point.createMany({
              data: result.forecast.map((point) => ({
                run_id: run.id,
                ds: toDbDate(point.ds),
                yhat: point.yhat,
                lo80: point.lo80,
                hi80: point.hi80,
              })),
            });
          }
        },
        { timeout: TRANSACTION_TIMEOUT_MS },
      );
    }

    return {
      ...base,
      status: "recorded",
      cutoffDate: result.cutoffDate,
      forecastTotal: result.summary.horizonTotal,
      error: null,
    };
  } catch (error) {
    const unforecastable =
      isForecastError(error) &&
      (error.code === "INSUFFICIENT_HISTORY" || error.code === "NO_SALES_DATA");
    const status = unforecastable ? "skipped" : "failed";
    const message = errorMessage(error);

    console[unforecastable ? "warn" : "error"](
      `[forecast-validation] ${brand.alias} x ${model.id} ${status}: ${message}`,
    );

    if (!context.dryRun) {
      await writePlaceholderRun(brand, model, context, status, message);
    }

    return {
      ...base,
      status,
      cutoffDate: null,
      forecastTotal: null,
      error: message,
    };
  }
}

export async function recordForecastValidationRuns(options: {
  horizonDays: number;
  brandAliases?: string[];
  modelIds?: string[];
  trigger: ForecastValidationTrigger;
  dryRun?: boolean;
  now?: Date;
}): Promise<ForecastValidationRecordResult> {
  const { horizonDays } = options;

  if (
    !Number.isInteger(horizonDays) ||
    horizonDays < FORECAST_VALIDATION_MIN_HORIZON_DAYS ||
    horizonDays > FORECAST_VALIDATION_MAX_HORIZON_DAYS
  ) {
    throw new ForecastValidationInputError(
      `--days must be an integer between ${FORECAST_VALIDATION_MIN_HORIZON_DAYS} and ${FORECAST_VALIDATION_MAX_HORIZON_DAYS}, got ${horizonDays}.`,
    );
  }

  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const [brands, models] = await Promise.all([
    resolveBrands(options.brandAliases),
    resolveModels(options.modelIds, now.getTime()),
  ]);

  const lock = await tryAcquireAdvisoryLock(
    RECORD_LOCK_KEY_1,
    RECORD_LOCK_KEY_2,
  );

  if (!lock) {
    return {
      status: "skipped",
      reason: "another process is already recording forecast validation runs",
    };
  }

  const startedAt = new Date();
  const context: RecordPairContext = {
    batchId: randomUUID(),
    trigger: options.trigger,
    horizonDays,
    dryRun,
    now,
  };
  const concurrency =
    getForecastValidationEnv().FORECAST_VALIDATION_CONCURRENCY;
  const outcomes: ForecastValidationRecordOutcome[] = [];

  try {
    // Brands sequentially, models of one brand concurrently: the engine
    // bounds in-flight requests, and each pair is one engine call anyway.
    for (const brand of brands) {
      const brandOutcomes = await mapWithConcurrency(
        models,
        concurrency,
        (model) => recordPair(brand, model, context),
      );
      outcomes.push(...brandOutcomes);
    }
  } finally {
    await lock.release();
  }

  const finishedAt = new Date();
  const count = (status: ForecastValidationRecordOutcome["status"]) =>
    outcomes.filter((outcome) => outcome.status === status).length;

  return {
    status: "ran",
    summary: {
      batchId: context.batchId,
      trigger: options.trigger,
      dryRun,
      horizonDays,
      brands: brands.map((brand) => brand.alias),
      models: models.map((model) => model.id),
      recorded: count("recorded"),
      duplicates: count("duplicate"),
      skipped: count("skipped"),
      failed: count("failed"),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      outcomes,
    },
  };
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

type DueRun = Prisma.forecast_validation_runGetPayload<{
  include: { points: true };
}>;

function groupByBrand(runs: DueRun[]): Map<string, DueRun[]> {
  const groups = new Map<string, DueRun[]>();
  for (const run of runs) {
    const group = groups.get(run.brand_alias);
    if (group) {
      group.push(run);
    } else {
      groups.set(run.brand_alias, [run]);
    }
  }
  return groups;
}

export async function evaluateDueForecastValidationRuns(options: {
  trigger: ForecastValidationTrigger;
  dryRun?: boolean;
  now?: Date;
}): Promise<ForecastValidationEvaluateResult> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const today = todayIso(now);
  const maxLagDays =
    getForecastValidationEnv().FORECAST_VALIDATION_MAX_LAG_DAYS;

  const lock = await tryAcquireAdvisoryLock(
    EVALUATE_LOCK_KEY_1,
    EVALUATE_LOCK_KEY_2,
  );

  if (!lock) {
    return {
      status: "skipped",
      reason: "another process is already evaluating forecast validation runs",
    };
  }

  const startedAt = new Date();
  const outcomes: ForecastValidationEvaluateOutcome[] = [];

  try {
    const due = await prisma.forecast_validation_run.findMany({
      where: { status: "pending", evaluate_after: { lte: toDbDate(today) } },
      include: { points: { orderBy: { ds: "asc" } } },
      orderBy: [{ brand_alias: "asc" }, { id: "asc" }],
    });

    for (const [brandAlias, runs] of groupByBrand(due)) {
      const base = (run: DueRun) => ({
        runId: run.id,
        brandAlias,
        modelId: run.model_id,
        quality: null,
        wapePct: null,
        deviationPct: null,
      });

      let latestSalesDate: string | null;
      try {
        latestSalesDate = await getLatestSalesDate(brandAlias, { now });
      } catch (error) {
        const reason = `latest sales date lookup failed: ${errorMessage(error)}`;
        console.error(`[forecast-validation] ${brandAlias}: ${reason}`);
        outcomes.push(
          ...runs.map((run) => ({
            ...base(run),
            status: "error" as const,
            reason,
          })),
        );
        continue;
      }

      const ready: DueRun[] = [];

      for (const run of runs) {
        const forecastTo = fromDbDate(run.forecast_to);

        if (latestSalesDate !== null && latestSalesDate >= forecastTo) {
          ready.push(run);
          continue;
        }

        const lagDays = daysBetweenIso(forecastTo, today);

        if (lagDays > maxLagDays) {
          const reason = `ACTUALS_UNAVAILABLE: no complete sales through ${forecastTo} after ${lagDays} days (latest ${latestSalesDate ?? "none"})`;
          if (!dryRun) {
            await prisma.forecast_validation_run.update({
              where: { id: run.id },
              data: { status: "failed", error: reason, evaluated_at: now },
            });
          }
          outcomes.push({ ...base(run), status: "failed", reason });
        } else {
          outcomes.push({
            ...base(run),
            status: "waiting",
            reason: `actuals complete through ${latestSalesDate ?? "none"}, need ${forecastTo}`,
          });
        }
      }

      if (ready.length === 0) {
        continue;
      }

      const from = ready
        .map((run) => fromDbDate(run.forecast_from))
        .reduce((min, value) => (value < min ? value : min));
      const to = ready
        .map((run) => fromDbDate(run.forecast_to))
        .reduce((max, value) => (value > max ? value : max));

      let actuals;
      try {
        actuals = await getDailySalesSeries({ brandAlias, from, to });
      } catch (error) {
        const reason = `sales series fetch failed: ${errorMessage(error)}`;
        console.error(`[forecast-validation] ${brandAlias}: ${reason}`);
        outcomes.push(
          ...ready.map((run) => ({
            ...base(run),
            status: "error" as const,
            reason,
          })),
        );
        continue;
      }

      for (const run of ready) {
        const comparison = compareForecastToActuals(
          run.points.map((point) => ({
            ds: fromDbDate(point.ds),
            yhat: point.yhat,
            lo80: point.lo80,
            hi80: point.hi80,
          })),
          actuals,
        );
        const actualByDs = new Map(
          comparison.points.map((point) => [point.ds, point.actual]),
        );

        if (!dryRun) {
          await prisma.$transaction(
            async (tx) => {
              await tx.forecast_validation_run.update({
                where: { id: run.id },
                data: {
                  status: "evaluated",
                  actual_total: comparison.actualTotal,
                  actual_days: comparison.actualDays,
                  deviation: comparison.deviation,
                  deviation_pct: comparison.deviationPct,
                  wape_pct: comparison.wapePct,
                  bias_pct: comparison.biasPct,
                  coverage80_pct: comparison.coverage80Pct,
                  quality: comparison.quality,
                  evaluated_at: now,
                  error: null,
                },
              });

              for (const point of run.points) {
                await tx.forecast_validation_point.update({
                  where: { id: point.id },
                  data: { actual: actualByDs.get(fromDbDate(point.ds)) ?? 0 },
                });
              }
            },
            { timeout: TRANSACTION_TIMEOUT_MS },
          );
        }

        outcomes.push({
          ...base(run),
          status: "evaluated",
          quality: comparison.quality,
          wapePct: comparison.wapePct,
          deviationPct: comparison.deviationPct,
          reason: null,
        });
      }
    }

    const finishedAt = new Date();
    const count = (status: ForecastValidationEvaluateOutcome["status"]) =>
      outcomes.filter((outcome) => outcome.status === status).length;

    return {
      status: "ran",
      summary: {
        trigger: options.trigger,
        dryRun,
        asOf: today,
        due: due.length,
        evaluated: count("evaluated"),
        waiting: count("waiting"),
        failed: count("failed"),
        errors: count("error"),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        outcomes,
      },
    };
  } finally {
    await lock.release();
  }
}

// ---------------------------------------------------------------------------
// In-process guard shared by the cron and any manual trigger
// ---------------------------------------------------------------------------

const globalForValidation = globalThis as typeof globalThis & {
  forecastValidationEvaluateInFlight?: Promise<ForecastValidationEvaluateResult>;
  forecastValidationRecordInFlight?: Promise<ForecastValidationRecordResult>;
  forecastValidationLastRecord?: ForecastValidationLastRecord;
};

export function tryEvaluateForecastValidationExclusively(
  trigger: ForecastValidationTrigger,
): Promise<ForecastValidationEvaluateResult> {
  if (globalForValidation.forecastValidationEvaluateInFlight) {
    return globalForValidation.forecastValidationEvaluateInFlight;
  }

  const run = evaluateDueForecastValidationRuns({ trigger }).finally(() => {
    globalForValidation.forecastValidationEvaluateInFlight = undefined;
  });

  globalForValidation.forecastValidationEvaluateInFlight = run;

  return run;
}

export function isForecastValidationEvaluateInFlight(): boolean {
  return Boolean(globalForValidation.forecastValidationEvaluateInFlight);
}

// ---------------------------------------------------------------------------
// Detached recording from the UI ("Record forecasts now")
// ---------------------------------------------------------------------------

export type ForecastValidationLastRecord = {
  startedAt: string;
  finishedAt: string | null;
  horizonDays: number;
  result: ForecastValidationRecordResult | null;
  error: string | null;
};

/**
 * Starts a recording run unless one is already in flight in this process.
 * The returned promise never rejects: the outcome (or the error) is kept in
 * `getLastForecastValidationRecord()` so the admin card can show it after the
 * detached run finishes.
 */
export function tryRecordForecastValidationExclusively(options: {
  horizonDays: number;
  trigger: ForecastValidationTrigger;
}): Promise<ForecastValidationRecordResult> {
  if (globalForValidation.forecastValidationRecordInFlight) {
    return Promise.resolve({
      status: "skipped",
      reason: "a recording run is already in progress",
    });
  }

  const last: ForecastValidationLastRecord = {
    startedAt: new Date().toISOString(),
    finishedAt: null,
    horizonDays: options.horizonDays,
    result: null,
    error: null,
  };
  globalForValidation.forecastValidationLastRecord = last;

  const run = recordForecastValidationRuns(options)
    .then((result) => {
      last.result = result;
      return result;
    })
    .catch((error: unknown): ForecastValidationRecordResult => {
      const message = error instanceof Error ? error.message : String(error);
      last.error = message;
      console.error("[forecast-validation] recording failed:", error);
      return { status: "skipped", reason: message };
    })
    .finally(() => {
      last.finishedAt = new Date().toISOString();
      globalForValidation.forecastValidationRecordInFlight = undefined;
    });

  globalForValidation.forecastValidationRecordInFlight = run;

  return run;
}

export function isForecastValidationRecordInFlight(): boolean {
  return Boolean(globalForValidation.forecastValidationRecordInFlight);
}

export function getLastForecastValidationRecord(): ForecastValidationLastRecord | null {
  return globalForValidation.forecastValidationLastRecord ?? null;
}
