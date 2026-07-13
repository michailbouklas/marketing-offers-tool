/**
 * Server-only helpers for the Foody `foody_*_by_period` views. These views
 * return exactly one row per (storeId, periodStart, periodEnd) — the latest
 * scrape wins, restricted to `aggregator = 'FOODY'`, legacy null-period rows
 * excluded. We read them with `$queryRaw` (no schema changes) rather than
 * modelling them, because `prisma/merchant-scrapes/schema.prisma` is a read-only
 * copy of a DB the scraper repo owns.
 *
 * The three accuracy rules from `docs/specs/frontend-handoff-period-queries.md`
 * live here at the query layer: (1) never mix week rows and month rows — every
 * query filters on `period_days` via {@link periodDaysSql}; (2) ratios are
 * recomputed from sums, never averaged; (3) rating/review totals are all-time
 * (handled in `ratings.server.ts`, not here).
 */
import { Prisma } from "../../../generated/merchant-scrapes-prisma/client";
import {
  type PeriodFilters,
  type PeriodKind,
  periodKinds,
} from "$lib/services/aggregator-kpis/aggregator-kpis";
import { z } from "zod";

/** How many recent periods a trend query fetches, per kind. */
export const PERIOD_TREND_LIMIT: Record<PeriodKind, number> = {
  // ~6 months of weeks, ~2 years of months — enough to read a trend.
  week: 26,
  month: 24,
};

/**
 * SQL fragment selecting a single period lane. Week and month rows overlap
 * (a month sums its weeks), so mixing them double-counts — every period query
 * must include this predicate.
 */
export function periodDaysSql(period: PeriodKind): Prisma.Sql {
  return period === "month"
    ? Prisma.sql`period_days >= 28`
    : Prisma.sql`period_days = 7`;
}

/**
 * SQL fragment restricting a period view to one store, or empty for all stores.
 * `"storeId"` is unqualified — safe in these queries because no joined CTE
 * exposes a competing `storeId` column.
 */
export function storeFilterSql(storeId: number | null): Prisma.Sql {
  return storeId ? Prisma.sql`AND "storeId" = ${storeId}` : Prisma.empty;
}

const periodFiltersSchema = z.object({
  storeId: z
    .preprocess((value) => {
      if (typeof value !== "string") {
        return value;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }, z.coerce.number().int().positive().optional())
    .catch(undefined),
  period: z.enum(periodKinds).catch("week"),
});

/** Parses the Foody period filters (store, week/month) from a URL. */
export function parsePeriodFilters(
  searchParams: URLSearchParams,
): PeriodFilters {
  const result = periodFiltersSchema.safeParse({
    storeId: searchParams.get("storeId") ?? undefined,
    period: searchParams.get("period") ?? undefined,
  });

  const data = result.success
    ? result.data
    : { storeId: undefined, period: "week" as const };

  return {
    storeId: data.storeId ?? null,
    period: data.period,
  };
}
