import { getGoogleAnalyticsRefreshEnv } from "$lib/server/env";
import { tryAcquireAdvisoryLock } from "$lib/server/pg-advisory-lock";
import { prisma } from "$lib/server/prisma";
import { fetchAndCacheDashboardReports } from "./dashboard-fetch.server";
import {
  GoogleAnalyticsApiError,
  isRetryableGoogleAnalyticsError,
} from "./ga4-client.server";
import {
  isGoogleAnalyticsDashboardReportKey,
  type GoogleAnalyticsDashboardReportKey,
  type GoogleAnalyticsRange,
  type GoogleAnalyticsRefreshJobStatus,
} from "./google-analytics";

/**
 * Retry queue for dashboard reports Google refused. One row per (property,
 * range) in `google_analytics_refresh_job`; the page enqueues on a retryable
 * failure (429 quota, 5xx) and the croner sweep in `scheduler.server.ts`
 * retries with exponential backoff until the reports land in the cache.
 *
 * Why not a queue library: the app runs on Node (bunqueue's embedded mode is
 * Bun-only), the job volume is a handful of rows, and Postgres + the existing
 * advisory lock already give us durability and cross-process exclusion.
 */

export type RefreshSweepTrigger = "cron" | "manual";

export type RefreshSweepSummary = {
  trigger: RefreshSweepTrigger;
  startedAt: string;
  durationMs: number;
  processed: number;
  completed: number;
  rescheduled: number;
  failed: number;
  /** The sweep stopped early because Google answered 429: the bucket is empty. */
  stoppedOnQuota: boolean;
};

export type RefreshSweepResult =
  | { status: "ran"; summary: RefreshSweepSummary }
  | { status: "skipped"; reason: string };

// Two arbitrary int4 constants identifying the cross-process sweep lock.
const LOCK_KEY_1 = 0x4761_5266 | 0; // "GaRf"
const LOCK_KEY_2 = 0x5265_7472 | 0; // "Retr"

/** First retry after the page's failure: soon, but after the next cron tick. */
export const REFRESH_FIRST_DELAY_MS = 60_000;
export const REFRESH_BACKOFF_BASE_MS = 5 * 60_000;
export const REFRESH_BACKOFF_MAX_MS = 60 * 60_000;
/** A `running` job older than this belonged to a process that died mid-sweep. */
export const REFRESH_STUCK_AFTER_MS = 10 * 60_000;
const SWEEP_BATCH_SIZE = 20;

const globalForRefresh = globalThis as typeof globalThis & {
  googleAnalyticsRefreshInFlight?: Promise<RefreshSweepResult>;
};

/**
 * Delay before retry number `attempts` (1-based): 5, 10, 20, 40, 60, 60… min.
 * Google's hourly buckets refresh "within an hour", so capping at one hour
 * guarantees progress once the bucket is back without hammering it meanwhile.
 */
export function backoffMs(attempts: number): number {
  const exponent = Math.max(0, Math.min(attempts, 30) - 1);
  return Math.min(
    REFRESH_BACKOFF_BASE_MS * 2 ** exponent,
    REFRESH_BACKOFF_MAX_MS,
  );
}

function errorFields(error: unknown): {
  lastError: string;
  lastStatus: number | null;
} {
  return {
    lastError: (error instanceof Error ? error.message : String(error)).slice(
      0,
      2000,
    ),
    lastStatus: error instanceof GoogleAnalyticsApiError ? error.status : null,
  };
}

function knownKeys(values: string[]): GoogleAnalyticsDashboardReportKey[] {
  return values.filter(isGoogleAnalyticsDashboardReportKey);
}

/**
 * Records that `keys` for this property/range could not be fetched. Idempotent:
 * a second failure merges its keys into the existing job and keeps its retry
 * schedule; a job that already finished (done/failed) is reopened from attempt
 * zero.
 */
export async function enqueueGoogleAnalyticsRefresh(input: {
  propertyRowId: string;
  range: GoogleAnalyticsRange;
  keys: readonly GoogleAnalyticsDashboardReportKey[];
  error: unknown;
  now?: Date;
}): Promise<void> {
  if (input.keys.length === 0) {
    return;
  }

  const now = input.now ?? new Date();
  const firstRunAt = new Date(now.getTime() + REFRESH_FIRST_DELAY_MS);
  const failure = errorFields(input.error);
  const where = {
    propertyRowId_range: {
      propertyRowId: input.propertyRowId,
      range: input.range,
    },
  };

  const existing = await prisma.google_analytics_refresh_job.findUnique({
    where,
    select: { status: true, reportKeys: true },
  });

  if (!existing) {
    await prisma.google_analytics_refresh_job.create({
      data: {
        propertyRowId: input.propertyRowId,
        range: input.range,
        reportKeys: [...input.keys],
        status: "pending",
        nextRunAt: firstRunAt,
        ...failure,
      },
    });
    return;
  }

  const merged = [...new Set([...existing.reportKeys, ...input.keys])];
  const reopen = existing.status === "done" || existing.status === "failed";

  await prisma.google_analytics_refresh_job.update({
    where,
    data: {
      reportKeys: merged,
      ...failure,
      ...(reopen
        ? {
            status: "pending",
            attempts: 0,
            nextRunAt: firstRunAt,
            finishedAt: null,
          }
        : {}),
    },
  });
}

export type RefreshJobView = {
  status: GoogleAnalyticsRefreshJobStatus;
  reportKeys: GoogleAnalyticsDashboardReportKey[];
  attempts: number;
  nextRunAt: Date;
  lastError: string | null;
};

export async function getGoogleAnalyticsRefreshJob(
  propertyRowId: string,
  range: GoogleAnalyticsRange,
): Promise<RefreshJobView | null> {
  const row = await prisma.google_analytics_refresh_job.findUnique({
    where: { propertyRowId_range: { propertyRowId, range } },
    select: {
      status: true,
      reportKeys: true,
      attempts: true,
      nextRunAt: true,
      lastError: true,
    },
  });

  return row ? { ...row, reportKeys: knownKeys(row.reportKeys) } : null;
}

/** Removes jobs — one property's or all. Returns the number of rows removed. */
export async function clearGoogleAnalyticsRefreshJobs(
  propertyRowId?: string,
): Promise<number> {
  const result = await prisma.google_analytics_refresh_job.deleteMany({
    where: propertyRowId ? { propertyRowId } : {},
  });

  return result.count;
}

/** Puts jobs a dead process left `running` back into the queue. */
export async function resetStuckGoogleAnalyticsRefreshJobs(
  now: Date = new Date(),
): Promise<number> {
  const result = await prisma.google_analytics_refresh_job.updateMany({
    where: {
      status: "running",
      updatedAt: { lt: new Date(now.getTime() - REFRESH_STUCK_AFTER_MS) },
    },
    data: { status: "pending" },
  });

  return result.count;
}

async function sweep(
  trigger: RefreshSweepTrigger,
): Promise<RefreshSweepResult> {
  const lock = await tryAcquireAdvisoryLock(LOCK_KEY_1, LOCK_KEY_2);

  if (!lock) {
    return {
      status: "skipped",
      reason: "another process is running the Google Analytics refresh sweep",
    };
  }

  const startedAt = new Date();
  const maxAgeMs =
    getGoogleAnalyticsRefreshEnv().GOOGLE_ANALYTICS_REFRESH_MAX_AGE_HOURS *
    3_600_000;
  const summary: RefreshSweepSummary = {
    trigger,
    startedAt: startedAt.toISOString(),
    durationMs: 0,
    processed: 0,
    completed: 0,
    rescheduled: 0,
    failed: 0,
    stoppedOnQuota: false,
  };

  try {
    const due = await prisma.google_analytics_refresh_job.findMany({
      where: { status: "pending", nextRunAt: { lte: startedAt } },
      orderBy: { nextRunAt: "asc" },
      take: SWEEP_BATCH_SIZE,
    });

    for (const job of due) {
      summary.processed += 1;
      const keys = knownKeys(job.reportKeys);
      const range = job.range as GoogleAnalyticsRange;

      await prisma.google_analytics_refresh_job.update({
        where: { id: job.id },
        data: { status: "running" },
      });

      const outcome = await fetchAndCacheDashboardReports(
        job.propertyRowId,
        range,
        keys,
      );
      const now = new Date();

      if (!outcome.error) {
        await prisma.google_analytics_refresh_job.update({
          where: { id: job.id },
          data: {
            status: "done",
            reportKeys: [],
            finishedAt: now,
            lastError: null,
            lastStatus: null,
          },
        });
        summary.completed += 1;
        console.info(
          `[google-analytics] refresh job ${job.id} done: ${keys.join(", ")} for property row ${job.propertyRowId} (${range}).`,
        );
        continue;
      }

      const failure = errorFields(outcome.error);
      const retryable = isRetryableGoogleAnalyticsError(outcome.error);
      const expired = now.getTime() - job.createdAt.getTime() > maxAgeMs;

      if (!retryable || expired) {
        await prisma.google_analytics_refresh_job.update({
          where: { id: job.id },
          data: {
            status: "failed",
            reportKeys: outcome.failedKeys,
            finishedAt: now,
            attempts: job.attempts + 1,
            ...failure,
          },
        });
        summary.failed += 1;
        console.error(
          `[google-analytics] refresh job ${job.id} failed${expired ? " (gave up after max age)" : ""}: ${failure.lastError}`,
        );
        continue;
      }

      const attempts = job.attempts + 1;

      await prisma.google_analytics_refresh_job.update({
        where: { id: job.id },
        data: {
          status: "pending",
          reportKeys: outcome.failedKeys,
          attempts,
          nextRunAt: new Date(now.getTime() + backoffMs(attempts)),
          ...failure,
        },
      });
      summary.rescheduled += 1;
      console.warn(
        `[google-analytics] refresh job ${job.id} rescheduled (attempt ${attempts}, ${failure.lastStatus ?? "?"}): ${failure.lastError}`,
      );

      // The quota bucket is empty for everyone on this project: stop here
      // rather than collecting one 429 per job.
      if (failure.lastStatus === 429) {
        summary.stoppedOnQuota = true;
        break;
      }
    }

    summary.durationMs = Date.now() - startedAt.getTime();
    return { status: "ran", summary };
  } finally {
    await lock.release();
  }
}

/**
 * Run a sweep unless one is already in flight in this process (the caller
 * then awaits that run). The advisory lock inside guards across processes.
 */
export function tryRunGoogleAnalyticsRefreshExclusively(
  trigger: RefreshSweepTrigger,
): Promise<RefreshSweepResult> {
  if (globalForRefresh.googleAnalyticsRefreshInFlight) {
    return globalForRefresh.googleAnalyticsRefreshInFlight;
  }

  const run = sweep(trigger).finally(() => {
    globalForRefresh.googleAnalyticsRefreshInFlight = undefined;
  });

  globalForRefresh.googleAnalyticsRefreshInFlight = run;
  return run;
}
