import { prisma } from "$lib/server/prisma";

/**
 * Persists presence heartbeats as `page_view` rows (one per navigation).
 *
 * A single stateless upsert keyed by the browser-minted `viewId`, so a server
 * restart never duplicates a view. Durations are measured on the server from
 * heartbeat arrival times: each beat adds the time since the previous beat,
 * capped at `MAX_BEAT_GAP_MS` so a sleeping laptop or a long-throttled hidden
 * tab cannot inflate time-on-page. Foreground time only accrues for intervals
 * that began with the tab visible.
 *
 * `WHERE page_view."userId" = EXCLUDED."userId"` makes the update a no-op if a
 * forged `viewId` belongs to another user.
 */

/** Matches the presence TTL: a gap longer than this is "the tab was gone". */
const MAX_BEAT_GAP_MS = 90_000;

export interface PageViewBeat {
  userId: string;
  viewId: string;
  tabId: string;
  routeId: string | null;
  path: string;
  title: string;
  visible: boolean;
}

export async function recordPageViewBeat(beat: PageViewBeat): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "page_view" (
      "id", "userId", "tabId", "routeId", "path", "title",
      "startedAt", "lastSeenAt", "visible", "foregroundMs", "totalMs"
    )
    VALUES (
      ${beat.viewId}::uuid, ${beat.userId}, ${beat.tabId}::uuid,
      ${beat.routeId}, ${beat.path}, ${beat.title},
      now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC', ${beat.visible}, 0, 0
    )
    ON CONFLICT ("id") DO UPDATE SET
      "totalMs" = "page_view"."totalMs" + LEAST(
        GREATEST(
          (EXTRACT(EPOCH FROM (EXCLUDED."lastSeenAt" - "page_view"."lastSeenAt")) * 1000)::int,
          0
        ),
        ${MAX_BEAT_GAP_MS}
      ),
      "foregroundMs" = "page_view"."foregroundMs" + CASE
        WHEN "page_view"."visible" THEN LEAST(
          GREATEST(
            (EXTRACT(EPOCH FROM (EXCLUDED."lastSeenAt" - "page_view"."lastSeenAt")) * 1000)::int,
            0
          ),
          ${MAX_BEAT_GAP_MS}
        )
        ELSE 0
      END,
      "lastSeenAt" = EXCLUDED."lastSeenAt",
      "visible" = EXCLUDED."visible",
      "path" = EXCLUDED."path",
      "title" = EXCLUDED."title",
      "routeId" = EXCLUDED."routeId"
    WHERE "page_view"."userId" = EXCLUDED."userId"
  `;
}

/**
 * Close out a view when its tab leaves: count the final interval, mark it
 * hidden so nothing further accrues. Never creates a row.
 */
export async function recordPageViewLeave(
  userId: string,
  viewId: string,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "page_view" SET
      "totalMs" = "totalMs" + LEAST(
        GREATEST(
          (EXTRACT(EPOCH FROM ((now() AT TIME ZONE 'UTC') - "lastSeenAt")) * 1000)::int,
          0
        ),
        ${MAX_BEAT_GAP_MS}
      ),
      "foregroundMs" = "foregroundMs" + CASE
        WHEN "visible" THEN LEAST(
          GREATEST(
            (EXTRACT(EPOCH FROM ((now() AT TIME ZONE 'UTC') - "lastSeenAt")) * 1000)::int,
            0
          ),
          ${MAX_BEAT_GAP_MS}
        )
        ELSE 0
      END,
      "lastSeenAt" = now() AT TIME ZONE 'UTC',
      "visible" = false
    WHERE "id" = ${viewId}::uuid AND "userId" = ${userId}
  `;
}
