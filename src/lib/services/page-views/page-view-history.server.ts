import { getPageViewEnv } from "$lib/server/env";
import { prisma } from "$lib/server/prisma";
import { Prisma } from "../../../generated/prisma/client";
import {
  ALL_TIME_FROM,
  resolveDayRange,
  splitAtCursor,
  todayInZone,
  type DayRange,
} from "./page-view-days";
import { rawViewsWithVisitStarts } from "./page-view-sql.server";
import type {
  HistoryDay,
  HistoryRouteRow,
  HistoryViewRow,
  UserHistory,
  VisitorSummaryRow,
} from "./page-views";

/**
 * Read side of page-view analytics for the superUser history pages.
 *
 * Every query splits the requested range at the rollup cursor: days on or
 * before it come from the permanent rollups (raw rows may be purged), later
 * days from raw `page_view` rows. Individual views (exact paths) are read from
 * raw rows wherever they still exist.
 */

/** Hard cap on individual views returned for one user's history. */
const MAX_DETAIL_ROWS = 5000;

export interface HistoryRange extends DayRange {
  today: string;
  /** Timezone that defines the days; the UI formats times in it too. */
  timeZone: string;
  /** The URL's own bounds (for the filter UI); null means open-ended. */
  selected: { from: string | null; to: string | null };
}

async function readCursor(): Promise<string | null> {
  const state = await prisma.page_view_rollup_state.findUnique({
    where: { id: 1 },
  });
  return state?.rolledUpThrough
    ? state.rolledUpThrough.toISOString().slice(0, 10)
    : null;
}

/** Parse `?from=&to=` (YYYY-MM-DD, activity timezone); no params = all time. */
export function parseHistoryRange(url: URL): HistoryRange {
  const timeZone = getPageViewEnv().ACTIVITY_TIMEZONE;
  const today = todayInZone(timeZone);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const range = resolveDayRange(from, to, today);
  return {
    ...range,
    today,
    timeZone,
    // Echo the resolved (validated, possibly swapped) bounds the URL asked for.
    selected: {
      from: from && range.from !== ALL_TIME_FROM ? range.from : null,
      to: to ? range.to : null,
    },
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

/** Every user with activity in `range`: last visit, visits, page views, time. */
export async function getVisitorSummary(
  range: DayRange,
): Promise<VisitorSummaryRow[]> {
  const timeZone = getPageViewEnv().ACTIVITY_TIMEZONE;
  const split = splitAtCursor(range, await readCursor());
  const parts: Prisma.Sql[] = [];

  if (split.rollup) {
    parts.push(Prisma.sql`
      SELECT "userId", SUM("visits")::bigint AS visits,
        SUM("pageViews")::bigint AS "pageViews",
        SUM("foregroundMs")::bigint AS "foregroundMs",
        MAX("lastSeenAt") AS "lastSeenAt"
      FROM "user_visit_daily"
      WHERE "day" BETWEEN ${split.rollup.from}::date AND ${split.rollup.to}::date
      GROUP BY "userId"
    `);
  }
  if (split.raw) {
    parts.push(Prisma.sql`
      SELECT v."userId", SUM(v."isVisitStart")::bigint AS visits,
        COUNT(*)::bigint AS "pageViews",
        SUM(v."foregroundMs")::bigint AS "foregroundMs",
        MAX(v."lastSeenAt") AS "lastSeenAt"
      FROM (${rawViewsWithVisitStarts(split.raw, timeZone)}) v
      GROUP BY v."userId"
    `);
  }
  if (parts.length === 0) {
    return [];
  }

  const rows = await prisma.$queryRaw<
    {
      userId: string;
      name: string;
      email: string;
      lastSeenAt: Date;
      visits: bigint;
      pageViews: bigint;
      foregroundMs: bigint;
    }[]
  >`
    SELECT u."id" AS "userId", u."name", u."email",
      MAX(p."lastSeenAt") AS "lastSeenAt",
      SUM(p.visits)::bigint AS visits,
      SUM(p."pageViews")::bigint AS "pageViews",
      SUM(p."foregroundMs")::bigint AS "foregroundMs"
    FROM (${Prisma.join(parts, " UNION ALL ")}) p
    JOIN "user" u ON u."id" = p."userId"
    GROUP BY u."id", u."name", u."email"
    ORDER BY MAX(p."lastSeenAt") DESC
  `;

  return rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    email: row.email,
    lastVisitAt: toIso(row.lastSeenAt),
    visits: Number(row.visits),
    pageViews: Number(row.pageViews),
    foregroundMs: Number(row.foregroundMs),
  }));
}

type DayTotalsRow = {
  day: string;
  visits: bigint;
  pageViews: bigint;
  foregroundMs: bigint;
};

type RouteRow = {
  day: string;
  routeId: string;
  views: bigint;
  foregroundMs: bigint;
  totalMs: bigint;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

/** One user's activity in `range`, grouped by day (newest first) and route. */
export async function getUserHistory(
  userId: string,
  range: DayRange,
): Promise<UserHistory | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) {
    return null;
  }

  const timeZone = getPageViewEnv().ACTIVITY_TIMEZONE;
  const split = splitAtCursor(range, await readCursor());

  const totalsParts: Prisma.Sql[] = [];
  const routeParts: Prisma.Sql[] = [];

  if (split.rollup) {
    totalsParts.push(Prisma.sql`
      SELECT to_char("day", 'YYYY-MM-DD') AS "day", "visits"::bigint AS visits,
        "pageViews"::bigint AS "pageViews", "foregroundMs"
      FROM "user_visit_daily"
      WHERE "userId" = ${userId}
        AND "day" BETWEEN ${split.rollup.from}::date AND ${split.rollup.to}::date
    `);
    routeParts.push(Prisma.sql`
      SELECT to_char("day", 'YYYY-MM-DD') AS "day", "routeId",
        "views"::bigint AS views, "foregroundMs", "totalMs",
        "firstSeenAt", "lastSeenAt"
      FROM "page_view_daily"
      WHERE "userId" = ${userId}
        AND "day" BETWEEN ${split.rollup.from}::date AND ${split.rollup.to}::date
    `);
  }
  if (split.raw) {
    const raw = rawViewsWithVisitStarts(split.raw, timeZone, userId);
    totalsParts.push(Prisma.sql`
      SELECT to_char(v."day", 'YYYY-MM-DD') AS "day",
        SUM(v."isVisitStart")::bigint AS visits, COUNT(*)::bigint AS "pageViews",
        SUM(v."foregroundMs")::bigint AS "foregroundMs"
      FROM (${raw}) v
      GROUP BY v."day"
    `);
    routeParts.push(Prisma.sql`
      SELECT to_char(v."day", 'YYYY-MM-DD') AS "day",
        COALESCE(v."routeId", '') AS "routeId", COUNT(*)::bigint AS views,
        SUM(v."foregroundMs")::bigint AS "foregroundMs",
        SUM(v."totalMs")::bigint AS "totalMs",
        MIN(v."startedAt") AS "firstSeenAt", MAX(v."lastSeenAt") AS "lastSeenAt"
      FROM (${raw}) v
      GROUP BY v."day", COALESCE(v."routeId", '')
    `);
  }

  const [totals, routes, views] = await Promise.all([
    totalsParts.length
      ? prisma.$queryRaw<
          DayTotalsRow[]
        >`${Prisma.join(totalsParts, " UNION ALL ")}`
      : Promise.resolve([] as DayTotalsRow[]),
    routeParts.length
      ? prisma.$queryRaw<RouteRow[]>`${Prisma.join(routeParts, " UNION ALL ")}`
      : Promise.resolve([] as RouteRow[]),
    // Exact views come from raw rows wherever they survive, on either side of
    // the cursor (visit tagging is not needed here).
    prisma.$queryRaw<
      (Omit<HistoryViewRow, "startedAt" | "lastSeenAt"> & {
        day: string;
        startedAt: Date;
        lastSeenAt: Date;
      })[]
    >`
      SELECT to_char(v."day", 'YYYY-MM-DD') AS "day", v."id"::text AS "id",
        COALESCE(v."routeId", '') AS "routeId", v."path", v."title",
        v."startedAt", v."lastSeenAt", v."foregroundMs", v."totalMs"
      FROM (${rawViewsWithVisitStarts(range, timeZone, userId)}) v
      ORDER BY v."startedAt" DESC
      LIMIT ${MAX_DETAIL_ROWS}
    `,
  ]);

  const days = new Map<string, HistoryDay>();
  const dayFor = (day: string): HistoryDay => {
    let entry = days.get(day);
    if (!entry) {
      entry = {
        day,
        visits: 0,
        pageViews: 0,
        foregroundMs: 0,
        routes: [],
        viewsByRoute: {},
        hasDetail: false,
      };
      days.set(day, entry);
    }
    return entry;
  };

  for (const row of totals) {
    const entry = dayFor(row.day);
    entry.visits = Number(row.visits);
    entry.pageViews = Number(row.pageViews);
    entry.foregroundMs = Number(row.foregroundMs);
  }

  for (const row of routes) {
    const route: HistoryRouteRow = {
      routeId: row.routeId,
      views: Number(row.views),
      foregroundMs: Number(row.foregroundMs),
      totalMs: Number(row.totalMs),
      firstSeenAt: toIso(row.firstSeenAt),
      lastSeenAt: toIso(row.lastSeenAt),
    };
    dayFor(row.day).routes.push(route);
  }

  for (const row of views) {
    const entry = dayFor(row.day);
    entry.hasDetail = true;
    (entry.viewsByRoute[row.routeId] ??= []).push({
      id: row.id,
      routeId: row.routeId,
      path: row.path,
      title: row.title,
      startedAt: toIso(row.startedAt),
      lastSeenAt: toIso(row.lastSeenAt),
      foregroundMs: Number(row.foregroundMs),
      totalMs: Number(row.totalMs),
    });
  }

  const sortedDays = [...days.values()].sort((a, b) =>
    b.day.localeCompare(a.day),
  );
  for (const day of sortedDays) {
    day.routes.sort(
      (a, b) => b.views - a.views || b.foregroundMs - a.foregroundMs,
    );
  }

  return {
    user,
    totals: {
      visits: sortedDays.reduce((sum, day) => sum + day.visits, 0),
      pageViews: sortedDays.reduce((sum, day) => sum + day.pageViews, 0),
      foregroundMs: sortedDays.reduce((sum, day) => sum + day.foregroundMs, 0),
    },
    days: sortedDays,
  };
}
