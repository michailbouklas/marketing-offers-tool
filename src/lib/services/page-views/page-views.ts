/**
 * Browser-safe shapes returned by the page-view history queries
 * (`page-view-history.server.ts`) to the `/admin/live-monitoring/history` pages.
 * Days are `YYYY-MM-DD` in the activity timezone; instants are ISO strings.
 */

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
