import { getPageViewEnv } from "$lib/server/env";
import { tryAcquireAdvisoryLock } from "$lib/server/pg-advisory-lock";
import { prisma } from "$lib/server/prisma";
import { Prisma } from "../../../generated/prisma/client";
import { addDays, todayInZone, type DayRange } from "./page-view-days";
import { localDay, rawViewsWithVisitStarts } from "./page-view-sql.server";

/**
 * Nightly consolidation of raw `page_view` rows into the permanent rollups
 * (`page_view_daily`, `user_visit_daily`), then purge of raw rows past the
 * retention window.
 *
 * Ordering guarantees no data is lost:
 * 1. Recompute complete days (cursor - REDO_DAYS .. yesterday) and upsert.
 *    Idempotent; re-doing recent days picks up late `leave` updates.
 * 2. Advance the cursor (`page_view_rollup_state.rolledUpThrough`).
 * 3. Delete raw rows older than the retention window AND on or before the
 *    cursor — a day is never purged before it has been rolled up.
 *
 * Cross-process exclusion via a Postgres advisory lock; within a process the
 * cron and the CLI share one in-flight promise.
 */

export type PageViewRollupTrigger = "cron" | "cli";

export interface PageViewRollupSummary {
  trigger: PageViewRollupTrigger;
  rolledUpDays: DayRange | null;
  rolledUpThrough: string | null;
  dailyRouteRows: number;
  dailyUserRows: number;
  purgedRows: number;
  durationMs: number;
}

export type PageViewRollupResult =
  | { status: "ran"; summary: PageViewRollupSummary }
  | { status: "skipped"; reason: string };

// Two arbitrary int4 constants identifying the cross-process rollup lock.
const LOCK_KEY_1 = 0x5076_5276 | 0; // "PvRv"
const LOCK_KEY_2 = 0x526f_6c6c | 0; // "Roll"
/** Days before the cursor recomputed on every run. */
const REDO_DAYS = 2;

const globalForRollup = globalThis as typeof globalThis & {
  pageViewRollupInFlight?: Promise<PageViewRollupResult>;
};

function toDay(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

async function readCursor(): Promise<string | null> {
  const state = await prisma.page_view_rollup_state.findUnique({
    where: { id: 1 },
  });
  return toDay(state?.rolledUpThrough);
}

async function earliestRawDay(timeZone: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ day: Date | null }[]>`
    SELECT ${localDay(Prisma.sql`MIN("startedAt")`, timeZone)} AS "day"
    FROM "page_view"
  `;
  return toDay(rows[0]?.day);
}

/**
 * Days to (re)compute, through yesterday.
 *
 * - First run (no cursor): every raw day. Nothing has ever been purged, so all
 *   raw days are complete — even ones already past retention.
 * - Later runs: everything after the cursor (never rolled up, never purged),
 *   plus up to REDO_DAYS before it to catch late updates — but only redo days
 *   still inside retention, because older ones may be partially purged and
 *   recomputing them would overwrite good rollups with partial data. Clipping
 *   never skips a day after the cursor, so a cron outage longer than the
 *   retention window loses nothing.
 */
export function rollupWindow(
  cursor: string | null,
  firstRawDay: string | null,
  today: string,
  retentionDays: number,
): DayRange | null {
  const yesterday = addDays(today, -1);
  let from: string | null = firstRawDay;

  if (cursor) {
    const afterCursor = addDays(cursor, 1);
    const retentionCutoff = addDays(today, -retentionDays);
    const redoFloor =
      retentionCutoff < afterCursor ? retentionCutoff : afterCursor;
    const redoFrom = addDays(cursor, -REDO_DAYS);
    from = redoFrom > redoFloor ? redoFrom : redoFloor;
  }

  if (!from) {
    return null;
  }
  return from <= yesterday ? { from, to: yesterday } : null;
}

/**
 * First local day whose raw rows are kept: rows starting before it are deleted.
 * The earlier of the retention cutoff and the day after the cursor, so nothing
 * not yet rolled up is ever purged.
 */
export function purgeBoundary(
  today: string,
  rolledUpThrough: string,
  retentionDays: number,
): string {
  const retentionCutoff = addDays(today, -retentionDays);
  const afterCursor = addDays(rolledUpThrough, 1);
  return retentionCutoff < afterCursor ? retentionCutoff : afterCursor;
}

async function upsertRollups(
  tx: Prisma.TransactionClient,
  range: DayRange,
  timeZone: string,
): Promise<{ routeRows: number; userRows: number }> {
  const views = rawViewsWithVisitStarts(range, timeZone);

  const routeRows = await tx.$executeRaw`
    INSERT INTO "page_view_daily" (
      "day", "userId", "routeId", "views", "foregroundMs", "totalMs",
      "firstSeenAt", "lastSeenAt"
    )
    SELECT
      v."day", v."userId", COALESCE(v."routeId", ''), COUNT(*)::int,
      SUM(v."foregroundMs")::bigint, SUM(v."totalMs")::bigint,
      MIN(v."startedAt"), MAX(v."lastSeenAt")
    FROM (${views}) v
    GROUP BY v."day", v."userId", COALESCE(v."routeId", '')
    ON CONFLICT ("day", "userId", "routeId") DO UPDATE SET
      "views" = EXCLUDED."views",
      "foregroundMs" = EXCLUDED."foregroundMs",
      "totalMs" = EXCLUDED."totalMs",
      "firstSeenAt" = EXCLUDED."firstSeenAt",
      "lastSeenAt" = EXCLUDED."lastSeenAt"
  `;

  const userRows = await tx.$executeRaw`
    INSERT INTO "user_visit_daily" (
      "day", "userId", "visits", "pageViews", "foregroundMs",
      "firstSeenAt", "lastSeenAt"
    )
    SELECT
      v."day", v."userId", SUM(v."isVisitStart")::int, COUNT(*)::int,
      SUM(v."foregroundMs")::bigint, MIN(v."startedAt"), MAX(v."lastSeenAt")
    FROM (${views}) v
    GROUP BY v."day", v."userId"
    ON CONFLICT ("day", "userId") DO UPDATE SET
      "visits" = EXCLUDED."visits",
      "pageViews" = EXCLUDED."pageViews",
      "foregroundMs" = EXCLUDED."foregroundMs",
      "firstSeenAt" = EXCLUDED."firstSeenAt",
      "lastSeenAt" = EXCLUDED."lastSeenAt"
  `;

  return { routeRows, userRows };
}

export async function runPageViewRollup(
  trigger: PageViewRollupTrigger,
  now: Date = new Date(),
): Promise<PageViewRollupResult> {
  const lock = await tryAcquireAdvisoryLock(LOCK_KEY_1, LOCK_KEY_2);
  if (!lock) {
    return {
      status: "skipped",
      reason: "another process is running the page-view rollup",
    };
  }

  const startedAt = Date.now();

  try {
    const { ACTIVITY_TIMEZONE: timeZone, PAGE_VIEW_RETENTION_DAYS } =
      getPageViewEnv();
    const today = todayInZone(timeZone, now);
    const cursor = await readCursor();
    const window = rollupWindow(
      cursor,
      cursor ? null : await earliestRawDay(timeZone),
      today,
      PAGE_VIEW_RETENTION_DAYS,
    );

    let routeRows = 0;
    let userRows = 0;
    let rolledUpThrough = cursor;

    if (window) {
      ({ routeRows, userRows } = await prisma.$transaction(
        async (tx) => {
          const counts = await upsertRollups(tx, window, timeZone);
          await tx.page_view_rollup_state.upsert({
            where: { id: 1 },
            create: {
              id: 1,
              rolledUpThrough: new Date(`${window.to}T00:00:00Z`),
            },
            update: { rolledUpThrough: new Date(`${window.to}T00:00:00Z`) },
          });
          return counts;
        },
        { timeout: 120_000 },
      ));
      rolledUpThrough = window.to;
    }

    // Purge only days that are both past retention and already rolled up.
    let purgedRows = 0;
    if (rolledUpThrough) {
      const purgeBefore = purgeBoundary(
        today,
        rolledUpThrough,
        PAGE_VIEW_RETENTION_DAYS,
      );
      purgedRows = await prisma.$executeRaw`
        DELETE FROM "page_view"
        WHERE "startedAt" < ((${purgeBefore}::date)::timestamp AT TIME ZONE ${timeZone} AT TIME ZONE 'UTC')
      `;
    }

    return {
      status: "ran",
      summary: {
        trigger,
        rolledUpDays: window,
        rolledUpThrough,
        dailyRouteRows: routeRows,
        dailyUserRows: userRows,
        purgedRows,
        durationMs: Date.now() - startedAt,
      },
    };
  } finally {
    await lock.release();
  }
}

/** Run the rollup unless one is already in flight in this process. */
export function tryRunPageViewRollupExclusively(
  trigger: PageViewRollupTrigger,
): Promise<PageViewRollupResult> {
  if (globalForRollup.pageViewRollupInFlight) {
    return globalForRollup.pageViewRollupInFlight;
  }

  const run = runPageViewRollup(trigger).finally(() => {
    globalForRollup.pageViewRollupInFlight = undefined;
  });

  globalForRollup.pageViewRollupInFlight = run;
  return run;
}
