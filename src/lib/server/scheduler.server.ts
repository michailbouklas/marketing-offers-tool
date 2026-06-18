import { building } from "$app/environment";
import { Cron } from "croner";
import {
  getNotificationsEnv,
  hasNotificationsTransport,
} from "$lib/server/notifications/notifications-env";
import { runOfferDigest } from "$lib/services/notifications/offer-digest.server";
import type { DigestRunSummary } from "$lib/services/notifications/types";

/**
 * In-process scheduler for the offer-notification digest. Bootstrapped once from
 * `src/hooks.server.ts` at server start. Assumes a single app instance: each
 * instance runs its own cron, so multiple replicas would each fire (the
 * advisory lock in `runOfferDigest` still prevents overlap, but only one
 * instance should schedule — add a leader env flag if this goes multi-replica).
 */

const globalForScheduler = globalThis as typeof globalThis & {
  offerDigestCron?: Cron;
  offerDigestRunning?: boolean;
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
 * Start the daily digest cron exactly once. No-op during build, when already
 * started (HMR-safe via the global flag), or when the digest transport is not
 * configured.
 */
export function startScheduler(): void {
  if (building) {
    return;
  }

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
