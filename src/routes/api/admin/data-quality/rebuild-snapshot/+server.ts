import { json } from "@sveltejs/kit";
import { requireApiAdminPermission } from "$lib/server/auth-guards";
import {
  isGapQueueRebuildInFlight,
  tryRebuildGapQueueSnapshotExclusively,
} from "$lib/services/gap-queue-snapshot.server";
import { getLatestSnapshotRefresh } from "$lib/services/offers-data-quality-snapshot.server";
import type { RequestHandler } from "./$types";

/**
 * Manual trigger for the offers data-quality gap-queue snapshot rebuild. The
 * rebuild also runs nightly on an in-process cron; this lets an admin with
 * the approval capability refresh the queue on demand (from the "Rebuild now"
 * button on /admin/pending-submissions). Returns 409 while a rebuild is
 * already running in this process or another.
 */
export const POST: RequestHandler = async (event) => {
  await requireApiAdminPermission(event, { submission: ["approve"] });

  if (isGapQueueRebuildInFlight()) {
    return json(
      { ok: false, reason: "a snapshot rebuild is already in progress" },
      { status: 409 },
    );
  }

  const result = await tryRebuildGapQueueSnapshotExclusively("manual");

  if (result.status === "skipped") {
    return json({ ok: false, reason: result.reason }, { status: 409 });
  }

  return json({ ok: true, summary: result.summary });
};

/** Last rebuild run (any outcome) for the admin status card. */
export const GET: RequestHandler = async (event) => {
  await requireApiAdminPermission(event, { submission: ["approve"] });

  return json({
    inFlight: isGapQueueRebuildInFlight(),
    lastRefresh: await getLatestSnapshotRefresh(),
  });
};
