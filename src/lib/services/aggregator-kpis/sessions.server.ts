/**
 * Server-only service for the `/aggregator-kpis/sessions` view. Reads scrape
 * *sessions* (one supervisor invocation each) from the `ScrapeRun` table in the
 * merchant-scrapes Postgres database via `merchantScrapesPrisma`.
 *
 * `ScrapeRun` has no Prisma relations (no store join), so — unlike the other
 * KPI services — there is no store-scoped filtering here.
 */
import { merchantScrapesPrisma } from "$lib/server/merchant-scrapes-prisma";
import {
  aggregators,
  scrapeRunStatuses,
  type AggregatorValue,
  type ScrapeRunStatus,
  type ScrapeSessionRow,
  type ScrapeSessionsView,
  type SessionFilters,
  type TimeseriesPoint,
} from "$lib/services/aggregator-kpis/aggregator-kpis";
import { toNumber } from "$lib/services/aggregator-kpis/kpi-shared.server";
import { z } from "zod";

/** Default trailing window (days) for the trend chart when no range is given. */
const DEFAULT_TREND_WINDOW_DAYS = 90;

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

// Optional URL params arrive as empty strings from GET forms; treat "" as unset.
function emptyToUndefined(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const sessionFiltersSchema = z.object({
  aggregator: z
    .preprocess(emptyToUndefined, z.enum(aggregators).optional())
    .catch(undefined),
  status: z
    .preprocess(emptyToUndefined, z.enum(scrapeRunStatuses).optional())
    .catch(undefined),
  from: z
    .preprocess(emptyToUndefined, z.string().regex(dayPattern).optional())
    .catch(undefined),
  to: z
    .preprocess(emptyToUndefined, z.string().regex(dayPattern).optional())
    .catch(undefined),
});

/** Parses the sessions filters (aggregator, status, date range) from a URL. */
export function parseSessionFilters(
  searchParams: URLSearchParams,
): SessionFilters {
  const result = sessionFiltersSchema.safeParse({
    aggregator: searchParams.get("aggregator") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const data = result.success ? result.data : {};

  return {
    aggregator: data.aggregator ?? null,
    status: data.status ?? null,
    from: data.from ?? null,
    to: data.to ?? null,
  };
}

/**
 * `where.startedAt` fragment for the filter's date range. When no explicit
 * range is given, defaults to a trailing window so the query stays bounded.
 */
function startedAtRange(
  filters: SessionFilters,
): { gte?: Date; lt?: Date } | undefined {
  const range: { gte?: Date; lt?: Date } = {};

  if (filters.from) {
    range.gte = new Date(`${filters.from}T00:00:00Z`);
  }

  if (filters.to) {
    // Inclusive upper bound → exclusive next-day bound.
    const upper = new Date(`${filters.to}T00:00:00Z`);
    upper.setUTCDate(upper.getUTCDate() + 1);
    range.lt = upper;
  }

  if (range.gte === undefined && range.lt === undefined) {
    const gte = new Date();
    gte.setUTCDate(gte.getUTCDate() - DEFAULT_TREND_WINDOW_DAYS);
    range.gte = gte;
  }

  return range;
}

/**
 * Buckets values by UTC day and SUMS them, yielding an ascending daily time
 * series. Unlike `averageByDay` in kpi-shared, this totals per day — the right
 * aggregate for "stores scraped per day".
 */
function sumByDay(
  points: { startedAt: Date; value: number | null }[],
): TimeseriesPoint[] {
  const buckets = new Map<string, number>();

  for (const point of points) {
    if (point.value === null) {
      continue;
    }

    const day = point.startedAt.toISOString().slice(0, 10);
    buckets.set(day, (buckets.get(day) ?? 0) + point.value);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, value]) => ({ day, value }));
}

/**
 * Scrape sessions matching the filters (newest first), a stores-scraped-per-day
 * trend, and summary totals. All numbers pass through `toNumber` and all dates
 * are ISO strings so the payload stays JSON-serializable to the client.
 */
export async function getSessionsView(
  filters: SessionFilters,
): Promise<ScrapeSessionsView> {
  const runs = await merchantScrapesPrisma.scrapeRun.findMany({
    where: {
      ...(filters.aggregator ? { aggregator: filters.aggregator } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      startedAt: startedAtRange(filters),
    },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      sessionId: true,
      aggregator: true,
      status: true,
      shard: true,
      fresh: true,
      runId: true,
      startedAt: true,
      endedAt: true,
      restarts: true,
      totalStores: true,
      okStores: true,
      partialStores: true,
      failedStores: true,
      skippedStores: true,
    },
  });

  const rows: ScrapeSessionRow[] = runs.map((run) => {
    const durationSeconds = run.endedAt
      ? Math.max(
          0,
          Math.round((run.endedAt.getTime() - run.startedAt.getTime()) / 1000),
        )
      : null;

    return {
      id: run.id,
      sessionId: run.sessionId,
      aggregator: run.aggregator as AggregatorValue,
      status: run.status as ScrapeRunStatus,
      shard: run.shard,
      fresh: run.fresh,
      runId: run.runId,
      startedAt: run.startedAt.toISOString(),
      endedAt: run.endedAt ? run.endedAt.toISOString() : null,
      durationSeconds,
      restarts: toNumber(run.restarts) ?? 0,
      totalStores: toNumber(run.totalStores),
      okStores: toNumber(run.okStores) ?? 0,
      partialStores: toNumber(run.partialStores) ?? 0,
      failedStores: toNumber(run.failedStores) ?? 0,
      skippedStores: toNumber(run.skippedStores) ?? 0,
    };
  });

  const trend = sumByDay(
    runs.map((run) => ({
      startedAt: run.startedAt,
      value: toNumber(run.okStores) ?? 0,
    })),
  );

  const totals = {
    sessions: rows.length,
    completed: rows.filter((row) => row.status === "COMPLETED").length,
    failed: rows.filter(
      (row) => row.status === "CRASHED" || row.status === "SYSTEMIC_BREAKAGE",
    ).length,
    running: rows.filter((row) => row.status === "RUNNING").length,
    storesScraped: rows.reduce((sum, row) => sum + row.okStores, 0),
  };

  return { rows, trend, totals };
}
