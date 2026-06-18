import { json } from "@sveltejs/kit";
import { requireApiAdminPermission } from "$lib/server/auth-guards";
import { tryRunDigestExclusively } from "$lib/server/scheduler.server";
import type { RequestHandler } from "./$types";

/**
 * Manual trigger for the offer-notification digest. The digest also runs on a
 * daily in-process cron; this endpoint lets an admin run a cycle on demand
 * (e.g. for the Part B verification checklist). Guarded by admin + the
 * `notifications:run` capability; goes through the same in-process run-lock as
 * the cron, returning 409 if a run is already in progress.
 */
export const POST: RequestHandler = async (event) => {
  await requireApiAdminPermission(event, { notifications: ["run"] });

  const result = await tryRunDigestExclusively();

  if (result.status === "skipped") {
    return json({ ok: false, reason: result.reason }, { status: 409 });
  }

  return json({ ok: true, summary: result.summary });
};
