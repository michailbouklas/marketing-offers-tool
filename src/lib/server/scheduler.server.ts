import { building } from "$app/environment";
import { Cron } from "croner";
import {
  getDataQualityEnv,
  getForecastEnv,
  getForecastValidationEnv,
  getGoogleAnalyticsRefreshEnv,
  getPageViewEnv,
} from "$lib/server/env";
import {
  getNotificationsEnv,
  hasNotificationsTransport,
} from "$lib/server/notifications/notifications-env";
import { tryEvaluateForecastValidationExclusively } from "$lib/services/forecasts/forecast-validation.server";
import { tryRebuildGapQueueSnapshotExclusively } from "$lib/services/gap-queue-snapshot.server";
import {
  resetStuckGoogleAnalyticsRefreshJobs,
  tryRunGoogleAnalyticsRefreshExclusively,
} from "$lib/services/google-analytics/refresh-queue.server";
import { runOfferDigest } from "$lib/services/notifications/offer-digest.server";
import { tryRunPageViewRollupExclusively } from "$lib/services/page-views/page-view-rollup.server";
import type { DigestRunSummary } from "$lib/services/notifications/types";

/**
 * In-process schedulers (croner), bootstrapped once from `src/hooks.server.ts`
 * at server start:
 *
 * - the offer-notification digest (`NOTIFICATIONS_CRON`), and
 * - the offers data-quality gap-queue snapshot rebuild (`DQ_SNAPSHOT_CRON`,
 *   default 04:00 `DQ_SNAPSHOT_TIMEZONE`), and
 * - the forecast validation sweep that scores recorded forecasts against
 *   actual sales once their window has passed (`FORECAST_VALIDATION_CRON`,
 *   default 06:00 `FORECAST_VALIDATION_TIMEZONE`), and
 * - the Google Analytics refresh sweep that retries dashboard reports Google
 *   refused (quota / 5xx) until they land (`GOOGLE_ANALYTICS_REFRESH_CRON`,
 *   default every minute), and
 * - the page-view rollup that folds raw live-monitoring page views into the
 *   permanent daily tables and purges raw rows past retention
 *   (`PAGE_VIEW_ROLLUP_CRON`, default 04:30 `ACTIVITY_TIMEZONE`).
 *
 * Assumes a single app instance: each instance runs its own cron, so multiple
 * replicas would each fire (the advisory locks still prevent overlapping work,
 * but only one instance should schedule — add a leader env flag if this goes
 * multi-replica).
 */

const globalForScheduler = globalThis as typeof globalThis & {
  offerDigestCron?: Cron;
  offerDigestRunning?: boolean;
  gapQueueSnapshotCron?: Cron;
  forecastValidationCron?: Cron;
  googleAnalyticsRefreshCron?: Cron;
  pageViewRollupCron?: Cron;
};

export type DigestTriggerResult =
  | { status: "ran"; summary: DigestRunSummary }
  | { status: "skipped"; reason: string };

/**
 * Run the digest unless one is already running in this process. Shared by the
 * cron callback and the manual-trigger route so the two can never overlap. The
 * in-memory flag guards this process; `runOfferDigest`'s advisory lock guards
 * across processes.
 */
export async function tryRunDigestExclusively(): Promise<DigestTriggerResult> {
  if (globalForScheduler.offerDigestRunning) {
    return { status: "skipped", reason: "a digest run is already in progress" };
  }

  globalForScheduler.offerDigestRunning = true;

  try {
    const summary = await runOfferDigest();
    return { status: "ran", summary };
  } finally {
    globalForScheduler.offerDigestRunning = false;
  }
}

/**
 * Start the daily digest cron exactly once. No-op when already started
 * (HMR-safe via the global flag) or when the digest transport is not
 * configured.
 */
function startDigestScheduler(): void {
  if (globalForScheduler.offerDigestCron) {
    return;
  }

  if (!hasNotificationsTransport()) {
    console.info(
      "[notifications] scheduler not started: transport not configured.",
    );
    return;
  }

  const pattern = getNotificationsEnv().NOTIFICATIONS_CRON;

  globalForScheduler.offerDigestCron = new Cron(
    pattern,
    { protect: true, name: "offer-digest" },
    async () => {
      try {
        const result = await tryRunDigestExclusively();

        if (result.status === "ran") {
          console.info(
            "[notifications] digest cycle complete:",
            result.summary,
          );
        } else {
          console.warn(
            `[notifications] digest cycle skipped: ${result.reason}`,
          );
        }
      } catch (error) {
        console.error("[notifications] digest cycle failed:", error);
      }
    },
  );

  console.info(`[notifications] digest scheduler started (cron "${pattern}").`);
}

/**
 * Start the nightly gap-queue snapshot rebuild exactly once. Independent of
 * the notifications config; disabled with `DQ_SNAPSHOT_ENABLED=false` (e.g.
 * when an external scheduler runs `bun run dq:rebuild` instead).
 */
function startGapQueueSnapshotScheduler(): void {
  if (globalForScheduler.gapQueueSnapshotCron) {
    return;
  }

  const dataQualityEnv = getDataQualityEnv();

  if (!dataQualityEnv.DQ_SNAPSHOT_ENABLED) {
    console.info("[data-quality] snapshot scheduler disabled by env.");
    return;
  }

  const pattern = dataQualityEnv.DQ_SNAPSHOT_CRON;
  const timezone = dataQualityEnv.DQ_SNAPSHOT_TIMEZONE;

  globalForScheduler.gapQueueSnapshotCron = new Cron(
    pattern,
    { protect: true, name: "dq-snapshot-rebuild", timezone },
    async () => {
      try {
        const result = await tryRebuildGapQueueSnapshotExclusively("cron");

        if (result.status === "ran") {
          console.info(
            "[data-quality] snapshot rebuild complete:",
            result.summary,
          );
        } else {
          console.warn(
            `[data-quality] snapshot rebuild skipped: ${result.reason}`,
          );
        }
      } catch (error) {
        console.error("[data-quality] snapshot rebuild failed:", error);
      }
    },
  );

  console.info(
    `[data-quality] snapshot scheduler started (cron "${pattern}", ${timezone}).`,
  );
}

/**
 * Start the daily forecast-validation sweep exactly once. Skipped when the
 * forecast engine is not configured or with `FORECAST_VALIDATION_ENABLED=false`
 * (e.g. when an external scheduler runs `bun run forecast:validate evaluate`).
 */
function startForecastValidationScheduler(): void {
  if (globalForScheduler.forecastValidationCron) {
    return;
  }

  if (!getForecastEnv().FORECAST_SERVICE_URL) {
    console.info(
      "[forecast-validation] scheduler not started: FORECAST_SERVICE_URL is not set.",
    );
    return;
  }

  const validationEnv = getForecastValidationEnv();

  if (!validationEnv.FORECAST_VALIDATION_ENABLED) {
    console.info("[forecast-validation] scheduler disabled by env.");
    return;
  }

  const pattern = validationEnv.FORECAST_VALIDATION_CRON;
  const timezone = validationEnv.FORECAST_VALIDATION_TIMEZONE;

  globalForScheduler.forecastValidationCron = new Cron(
    pattern,
    { protect: true, name: "forecast-validation", timezone },
    async () => {
      try {
        const result = await tryEvaluateForecastValidationExclusively("cron");

        if (result.status === "ran") {
          console.info(
            "[forecast-validation] evaluation sweep complete:",
            result.summary,
          );
        } else {
          console.warn(
            `[forecast-validation] evaluation sweep skipped: ${result.reason}`,
          );
        }
      } catch (error) {
        console.error("[forecast-validation] evaluation sweep failed:", error);
      }
    },
  );

  console.info(
    `[forecast-validation] scheduler started (cron "${pattern}", ${timezone}).`,
  );
}

/**
 * Start the Google Analytics refresh sweep exactly once. Disabled with
 * `GOOGLE_ANALYTICS_REFRESH_ENABLED=false`. Jobs a previous process left
 * `running` are put back in the queue on start.
 */
function startGoogleAnalyticsRefreshScheduler(): void {
  if (globalForScheduler.googleAnalyticsRefreshCron) {
    return;
  }

  const refreshEnv = getGoogleAnalyticsRefreshEnv();

  if (!refreshEnv.GOOGLE_ANALYTICS_REFRESH_ENABLED) {
    console.info("[google-analytics] refresh scheduler disabled by env.");
    return;
  }

  const pattern = refreshEnv.GOOGLE_ANALYTICS_REFRESH_CRON;

  globalForScheduler.googleAnalyticsRefreshCron = new Cron(
    pattern,
    { protect: true, name: "google-analytics-refresh" },
    async () => {
      try {
        const result = await tryRunGoogleAnalyticsRefreshExclusively("cron");

        if (result.status === "ran" && result.summary.processed > 0) {
          console.info(
            "[google-analytics] refresh sweep complete:",
            result.summary,
          );
        } else if (result.status === "skipped") {
          console.warn(
            `[google-analytics] refresh sweep skipped: ${result.reason}`,
          );
        }
      } catch (error) {
        console.error("[google-analytics] refresh sweep failed:", error);
      }
    },
  );

  resetStuckGoogleAnalyticsRefreshJobs()
    .then((count) => {
      if (count > 0) {
        console.warn(
          `[google-analytics] re-queued ${count} refresh job(s) left running by a previous process.`,
        );
      }
    })
    .catch((error) => {
      console.error(
        "[google-analytics] could not reset stuck refresh jobs:",
        error,
      );
    });

  console.info(
    `[google-analytics] refresh scheduler started (cron "${pattern}").`,
  );
}

/**
 * Start the nightly page-view rollup + purge exactly once. Disabled with
 * `PAGE_VIEW_ROLLUP_ENABLED=false` (e.g. when an external scheduler runs
 * `bun run page-views:rollup` instead).
 */
function startPageViewRollupScheduler(): void {
  if (globalForScheduler.pageViewRollupCron) {
    return;
  }

  const pageViewEnv = getPageViewEnv();

  if (!pageViewEnv.PAGE_VIEW_ROLLUP_ENABLED) {
    console.info("[page-views] rollup scheduler disabled by env.");
    return;
  }

  const pattern = pageViewEnv.PAGE_VIEW_ROLLUP_CRON;
  const timezone = pageViewEnv.ACTIVITY_TIMEZONE;

  globalForScheduler.pageViewRollupCron = new Cron(
    pattern,
    { protect: true, name: "page-view-rollup", timezone },
    async () => {
      try {
        const result = await tryRunPageViewRollupExclusively("cron");

        if (result.status === "ran") {
          console.info("[page-views] rollup complete:", result.summary);
        } else {
          console.warn(`[page-views] rollup skipped: ${result.reason}`);
        }
      } catch (error) {
        console.error("[page-views] rollup failed:", error);
      }
    },
  );

  console.info(
    `[page-views] rollup scheduler started (cron "${pattern}", ${timezone}).`,
  );
}

/** Start every in-process cron. No-op during build. */
export function startScheduler(): void {
  if (building) {
    return;
  }

  startDigestScheduler();
  startGapQueueSnapshotScheduler();
  startForecastValidationScheduler();
  startGoogleAnalyticsRefreshScheduler();
  startPageViewRollupScheduler();
}
