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
import type { RequestEvent } from "@sveltejs/kit";
import { Prisma } from "../../../generated/merchant-scrapes-prisma/client";
import {
  type AggregatorValue,
  type PeriodFilters,
  type PeriodKind,
  type StoreRef,
  periodKinds,
} from "$lib/services/aggregator-kpis/aggregator-kpis";
import {
  AGGREGATOR_COOKIE,
  parseAggregatorValue,
} from "$lib/services/aggregator-kpis/aggregator-cookie";
import { withBrandStores } from "$lib/services/aggregator-kpis/brand-stores.server";
import { listStores } from "$lib/services/aggregator-kpis/kpi-shared.server";
import type { BrandOption } from "$lib/services/brands";
import { listBrands } from "$lib/services/brands.server";
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
 * `"storeId"` is unqualified — safe in these queries because no joined CTE or
 * child table (`ClosureDay`, `RejectionDay`, `RatingStarBucket`) exposes a
 * competing `storeId` column.
 */
export function storeFilterSql(storeId: number | null): Prisma.Sql {
  return storeId ? Prisma.sql`AND "storeId" = ${storeId}` : Prisma.empty;
}

/**
 * SQL fragment restricting a period view to a brand's stores.
 *
 * `null` means no brand filter. An **empty array** means the selected brand
 * owns no store on this platform and the query must return zero rows — never
 * silently widen that to "all stores", which would show another brand's data.
 */
export function storeIdsFilterSql(storeIds: number[] | null): Prisma.Sql {
  if (storeIds === null) {
    return Prisma.empty;
  }

  if (storeIds.length === 0) {
    return Prisma.sql`AND FALSE`;
  }

  return Prisma.sql`AND "storeId" IN (${Prisma.join(storeIds)})`;
}

/**
 * Both store-scope predicates for a period query: the single-store filter and
 * the brand's store set, ANDed. Every period query interpolates this rather
 * than the two fragments separately, so a new scope can never be half-applied.
 */
export function periodScopeSql(filters: PeriodFilters): Prisma.Sql {
  return Prisma.sql`${storeFilterSql(filters.storeId)} ${storeIdsFilterSql(filters.storeIds)}`;
}

/**
 * Filters for a single-store detail view: that store, no brand narrowing (the
 * store was already resolved by id, so a brand filter could only contradict it).
 */
export function singleStoreFilters(
  storeId: number,
  period: PeriodKind,
): PeriodFilters {
  return { storeId, period, brandId: null, storeIds: null };
}

/** Filters covering every store in a period lane — no store or brand scope. */
export function allStoresFilters(period: PeriodKind): PeriodFilters {
  return { storeId: null, period, brandId: null, storeIds: null };
}

const optionalPositiveInt = z
  .preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.coerce.number().int().positive().optional())
  .catch(undefined);

const periodFiltersSchema = z.object({
  storeId: optionalPositiveInt,
  brandId: optionalPositiveInt,
  period: z.enum(periodKinds).catch("week"),
});

/**
 * Resolves the active aggregator for a period page from the persisted cookie,
 * defaulting to Foody. The cookie is the source of truth (set by the filter-bar
 * toggle) so the choice carries across every KPI page without a URL param.
 */
export function resolveAggregator(event: {
  cookies: { get(name: string): string | undefined };
}): AggregatorValue {
  return parseAggregatorValue(event.cookies.get(AGGREGATOR_COOKIE));
}

/**
 * Parses the period filters (store, brand, week/month) from a URL. Stays pure
 * and synchronous: `storeIds` is always null here, because resolving a
 * `brandId` into store ids needs a database round-trip and is the loader's job,
 * via `withBrandStores` from `brand-stores.server.ts`.
 */
export function parsePeriodFilters(
  searchParams: URLSearchParams,
): PeriodFilters {
  const result = periodFiltersSchema.safeParse({
    storeId: searchParams.get("storeId") ?? undefined,
    brandId: searchParams.get("brandId") ?? undefined,
    period: searchParams.get("period") ?? undefined,
  });

  const data = result.success
    ? result.data
    : { storeId: undefined, brandId: undefined, period: "week" as const };

  return {
    storeId: data.storeId ?? null,
    brandId: data.brandId ?? null,
    storeIds: null,
    period: data.period,
  };
}

/**
 * Everything a period page's filter bar needs, resolved in one place: the URL
 * filters with the brand's store ids attached, the active platform, the brand
 * options, and the store list **narrowed to the selected brand**.
 *
 * The narrowing happens server-side because the client has no brand→store map.
 * A brand owning no store on this platform leaves only "All stores" in the
 * dropdown — the honest representation of an empty scope.
 */
export async function loadPeriodScope(event: RequestEvent): Promise<{
  filters: PeriodFilters;
  aggregator: AggregatorValue;
  brands: BrandOption[];
  stores: StoreRef[];
}> {
  const aggregator = resolveAggregator(event);

  const [filters, brands, allStores] = await Promise.all([
    withBrandStores(parsePeriodFilters(event.url.searchParams), aggregator),
    listBrands({ active: true }),
    listStores(aggregator),
  ]);

  const scopedIds = filters.storeIds;
  const stores =
    scopedIds === null
      ? allStores
      : allStores.filter((store) => scopedIds.includes(store.id));

  return { filters, aggregator, brands, stores };
}
