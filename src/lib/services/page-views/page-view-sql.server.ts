import { Prisma } from "../../../generated/prisma/client";
import { addDays, type DayRange } from "./page-view-days";

/**
 * SQL fragments shared by the nightly rollup and the history queries.
 *
 * `page_view` timestamps are `timestamp(3)` holding UTC (Prisma's convention).
 * A calendar day is defined in the activity timezone, so:
 * - bucketing a row:  ("startedAt" AT TIME ZONE 'UTC' AT TIME ZONE tz)::date
 * - filtering a range: compare "startedAt" with the UTC instants of local
 *   midnight, which keeps the (userId, startedAt) index usable.
 */

/** A gap longer than this between a user's views starts a new visit. */
export const VISIT_GAP_MINUTES = 30;

/**
 * Look this far before a range when detecting visit starts, so a visit that
 * began just before the range is not counted again on its first in-range view.
 */
const VISIT_LOOKBACK_DAYS = 1;

/** UTC instant of local midnight at the start of `day`. */
export function localMidnightUtc(day: string, timeZone: string): Prisma.Sql {
  return Prisma.sql`((${day}::date)::timestamp AT TIME ZONE ${timeZone} AT TIME ZONE 'UTC')`;
}

/** Local calendar day of a UTC `timestamp` column expression. */
export function localDay(column: Prisma.Sql, timeZone: string): Prisma.Sql {
  return Prisma.sql`((${column} AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone})::date)`;
}

/**
 * Raw views whose local start day falls in `range`, each tagged with its local
 * `day` and `isVisitStart` (1 when it starts a new visit, else 0).
 *
 * A view starts a visit when it begins more than VISIT_GAP_MINUTES after the
 * latest `lastSeenAt` of all the user's earlier views. Using the running max
 * (not just the previous row) means overlapping tabs never split a visit.
 */
export function rawViewsWithVisitStarts(
  range: DayRange,
  timeZone: string,
  userId?: string,
): Prisma.Sql {
  const userFilter = userId
    ? Prisma.sql`AND pv."userId" = ${userId}`
    : Prisma.empty;
  const rangeStart = localMidnightUtc(range.from, timeZone);
  const rangeEnd = localMidnightUtc(addDays(range.to, 1), timeZone);
  const lookbackStart = localMidnightUtc(
    addDays(range.from, -VISIT_LOOKBACK_DAYS),
    timeZone,
  );

  return Prisma.sql`
    SELECT * FROM (
      SELECT
        pv."id",
        pv."userId",
        pv."routeId",
        pv."path",
        pv."title",
        pv."startedAt",
        pv."lastSeenAt",
        pv."foregroundMs",
        pv."totalMs",
        ${localDay(Prisma.sql`pv."startedAt"`, timeZone)} AS "day",
        CASE
          WHEN MAX(pv."lastSeenAt") OVER w IS NULL
            OR pv."startedAt" - MAX(pv."lastSeenAt") OVER w
              > make_interval(mins => ${VISIT_GAP_MINUTES})
          THEN 1 ELSE 0
        END AS "isVisitStart"
      FROM "page_view" pv
      WHERE pv."startedAt" >= ${lookbackStart}
        AND pv."startedAt" < ${rangeEnd}
        ${userFilter}
      WINDOW w AS (
        PARTITION BY pv."userId"
        ORDER BY pv."startedAt", pv."id"
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      )
    ) tagged
    WHERE tagged."startedAt" >= ${rangeStart}
  `;
}
