/**
 * Browser-safe shapes returned by the page-view history queries
 * (`page-view-history.server.ts`) to the `/admin/live-monitoring/history` pages.
 * Days are `YYYY-MM-DD` in the activity timezone; instants are ISO strings.
 */

import { addDays } from "./page-view-days";

export interface VisitorSummaryRow {
  userId: string;
  name: string;
  email: string;
  lastVisitAt: string;
  visits: number;
  pageViews: number;
  foregroundMs: number;
}

/** Per-route aggregate within one day. `routeId` is "" when unknown (404s). */
export interface HistoryRouteRow {
  routeId: string;
  views: number;
  foregroundMs: number;
  totalMs: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

/** One concrete page view, only available while raw rows are retained. */
export interface HistoryViewRow {
  id: string;
  routeId: string;
  path: string;
  title: string;
  startedAt: string;
  lastSeenAt: string;
  foregroundMs: number;
  totalMs: number;
}

export interface HistoryDay {
  day: string;
  visits: number;
  pageViews: number;
  foregroundMs: number;
  routes: HistoryRouteRow[];
  /** Individual views keyed by `routeId`; empty once the raw rows are purged. */
  viewsByRoute: Record<string, HistoryViewRow[]>;
  /** False when only the permanent rollup survives for this day. */
  hasDetail: boolean;
}

export interface UserHistory {
  user: { id: string; name: string; email: string; role: string | null };
  totals: { visits: number; pageViews: number; foregroundMs: number };
  days: HistoryDay[];
}

/** "1 h 5 min", "12 min", "<1 min". */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) {
    return "<1 min";
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export interface UserUsageSummary {
  totals: UserHistory["totals"];
  /** Last day with any activity in the range, or null. */
  lastActiveDay: string | null;
  /** Every day of the range, oldest first, zero-filled. */
  daily: {
    day: string;
    visits: number;
    pageViews: number;
    foregroundMs: number;
  }[];
  /** Routes summed across the range, most viewed first. */
  topRoutes: { routeId: string; views: number; foregroundMs: number }[];
  /** Views per app section (see `routeSection`), most used first. */
  sections: {
    section: string;
    views: number;
    foregroundMs: number;
    /** Fraction of all views in the range, 0..1. */
    share: number;
  }[];
}

/**
 * Collapse a `UserHistory` into chart-ready usage stats so the details page
 * never ships the raw per-view rows to the browser.
 */
export function summarizeUserUsage(
  history: UserHistory,
  range: { from: string; to: string },
  topRouteLimit = 10,
): UserUsageSummary {
  const byDay = new Map(history.days.map((day) => [day.day, day]));
  const daily: UserUsageSummary["daily"] = [];
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
    const entry = byDay.get(day);
    daily.push({
      day,
      visits: entry?.visits ?? 0,
      pageViews: entry?.pageViews ?? 0,
      foregroundMs: entry?.foregroundMs ?? 0,
    });
  }

  const routes = new Map<string, { views: number; foregroundMs: number }>();
  const sections = new Map<string, { views: number; foregroundMs: number }>();
  for (const day of history.days) {
    for (const route of day.routes) {
      for (const [map, key] of [
        [routes, route.routeId],
        [sections, routeSection(route.routeId)],
      ] as const) {
        const sum = map.get(key) ?? { views: 0, foregroundMs: 0 };
        sum.views += route.views;
        sum.foregroundMs += route.foregroundMs;
        map.set(key, sum);
      }
    }
  }

  const totalViews = [...sections.values()].reduce((n, s) => n + s.views, 0);

  return {
    totals: history.totals,
    // `history.days` is sorted newest first.
    lastActiveDay: history.days.find((day) => day.pageViews > 0)?.day ?? null,
    daily,
    topRoutes: byMostUsed(routes, "routeId").slice(0, topRouteLimit),
    sections: byMostUsed(sections, "section").map((row) => ({
      ...row,
      share: totalViews > 0 ? row.views / totalViews : 0,
    })),
  };
}

function byMostUsed<K extends string>(
  map: Map<string, { views: number; foregroundMs: number }>,
  keyName: K,
) {
  return [...map]
    .map(
      ([key, sum]) =>
        ({ [keyName]: key, ...sum }) as Record<K, string> & {
          views: number;
          foregroundMs: number;
        },
    )
    .sort((a, b) => b.views - a.views || b.foregroundMs - a.foregroundMs);
}

/**
 * App section of a route id: its first real segment, e.g.
 * "/sales/offers" -> "/sales". Route groups like "(auth)" are skipped;
 * "" (404) stays "".
 */
export function routeSection(routeId: string): string {
  if (!routeId) {
    return "";
  }
  const segment = routeId
    .split("/")
    .find((part) => part && !part.startsWith("("));
  return segment ? `/${segment}` : "/";
}
