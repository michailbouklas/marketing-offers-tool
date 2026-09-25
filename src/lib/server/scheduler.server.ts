import { building } from "$app/environment";
import { Cron } from "croner";
import { getDataQualityEnv } from "$lib/server/env";
import {
  getNotificationsEnv,
  hasNotificationsTransport,
} from "$lib/server/notifications/notifications-env";
import { tryRebuildGapQueueSnapshotExclusively } from "$lib/services/gap-queue-snapshot.server";
import { runOfferDigest } from "$lib/services/notifications/offer-digest.server";
import type { DigestRunSummary } from "$lib/services/notifications/types";

/**
 * In-process schedulers (croner), bootstrapped once from `src/hooks.server.ts`
 * at server start:
 *
 * - the offer-notification digest (`NOTIFICATIONS_CRON`), and
 * - the offers data-quality gap-queue snapshot rebuild (`DQ_SNAPSHOT_CRON`,
 *   default 04:00 `DQ_SNAPSHOT_TIMEZONE`).
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

/** Start every in-process cron. No-op during build. */
export function startScheduler(): void {
  if (building) {
    return;
  }

  startDigestScheduler();
  startGapQueueSnapshotScheduler();
}
