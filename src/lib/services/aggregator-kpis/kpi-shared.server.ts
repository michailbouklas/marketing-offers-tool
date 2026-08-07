/**
 * Server-only helpers shared by the aggregator-KPI services. Every query runs
 * against the merchant-scrapes Postgres database via `merchantScrapesPrisma`.
 */
import { merchantScrapesPrisma } from "$lib/server/merchant-scrapes-prisma";
import { getBrandRefsByStoreIds } from "$lib/services/aggregator-kpis/brand-stores.server";
import {
  aggregators,
  type AggregatorValue,
  type KpiFilters,
  type KpiStoreDetail,
  type StoreRef,
  type TimeseriesPoint,
} from "$lib/services/aggregator-kpis/aggregator-kpis";
import { z } from "zod";

/** Default trailing window (days) for trend charts when no range is supplied. */
const DEFAULT_TREND_WINDOW_DAYS = 90;

/**
 * Coerces a Prisma value (Decimal, bigint, number, string, null) to a plain
 * `number | null` so the payload stays JSON-serializable to the client.
 */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * `where` fragment restricting a `Store` relation by the shared filters.
 *
 * The single-store and brand scopes are **intersected**, not merged: spreading
 * both as `id` would silently drop one. When a store is picked that the brand
 * does not own, the intersection is empty and the query returns nothing —
 * consistent with `storeIdsFilterSql`'s `AND FALSE`.
 */
export function storeWhere(filters: KpiFilters) {
  const ids =
    filters.storeIds !== null
      ? filters.storeId !== null
        ? filters.storeIds.includes(filters.storeId)
          ? [filters.storeId]
          : []
        : filters.storeIds
      : null;

  return {
    ...(filters.aggregator ? { aggregator: filters.aggregator } : {}),
    ...(ids !== null
      ? { id: { in: ids } }
      : filters.storeId
        ? { id: filters.storeId }
        : {}),
  };
}

/**
 * `where.scrapedAt` fragment for the filter's date range. When no explicit
 * range is given, defaults to a trailing window so trend queries stay bounded.
 */
export function scrapedAtRange(
  filters: KpiFilters,
  { withDefaultWindow = false }: { withDefaultWindow?: boolean } = {},
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

  if (range.gte === undefined && range.lt === undefined && withDefaultWindow) {
    const gte = new Date();
    gte.setUTCDate(gte.getUTCDate() - DEFAULT_TREND_WINDOW_DAYS);
    range.gte = gte;
  }

  return range.gte === undefined && range.lt === undefined ? undefined : range;
}

/**
 * Buckets snapshot values by UTC day and averages them, yielding an ascending
 * daily time series. Null values are ignored.
 */
export function averageByDay(
  points: { scrapedAt: Date; value: number | null }[],
): TimeseriesPoint[] {
  const buckets = new Map<string, { sum: number; count: number }>();

  for (const point of points) {
    if (point.value === null) {
      continue;
    }

    const day = point.scrapedAt.toISOString().slice(0, 10);
    const bucket = buckets.get(day) ?? { sum: 0, count: 0 };
    bucket.sum += point.value;
    bucket.count += 1;
    buckets.set(day, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, bucket]) => ({
      day,
      value: bucket.count > 0 ? bucket.sum / bucket.count : 0,
    }));
}

/** Average of the non-null values in a list; null when there are none. */
export function averageOf(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);

  if (present.length === 0) {
    return null;
  }

  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

// Optional URL params arrive as empty strings from GET forms; treat "" as unset.
function emptyToUndefined(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const kpiFiltersSchema = z.object({
  aggregator: z
    .preprocess(emptyToUndefined, z.enum(aggregators).optional())
    .catch(undefined),
  storeId: z
    .preprocess(emptyToUndefined, z.coerce.number().int().positive().optional())
    .catch(undefined),
  brandId: z
    .preprocess(emptyToUndefined, z.coerce.number().int().positive().optional())
    .catch(undefined),
  from: z
    .preprocess(emptyToUndefined, z.string().regex(dayPattern).optional())
    .catch(undefined),
  to: z
    .preprocess(emptyToUndefined, z.string().regex(dayPattern).optional())
    .catch(undefined),
});

/**
 * Parses the shared KPI filters (aggregator, store, brand, date range) from a
 * URL. Pure and synchronous — `storeIds` is resolved from `brandId` by the
 * loader via `withBrandStores` (see `parsePeriodFilters` for the same split).
 */
export function parseKpiFilters(searchParams: URLSearchParams): KpiFilters {
  const result = kpiFiltersSchema.safeParse({
    aggregator: searchParams.get("aggregator") ?? undefined,
    storeId: searchParams.get("storeId") ?? undefined,
    brandId: searchParams.get("brandId") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const data = result.success ? result.data : {};

  return {
    aggregator: data.aggregator ?? null,
    storeId: data.storeId ?? null,
    brandId: data.brandId ?? null,
    storeIds: null,
    from: data.from ?? null,
    to: data.to ?? null,
  };
}

/** Full detail for one store, or null when it doesn't exist. */
export async function getKpiStore(
  storeId: number,
): Promise<KpiStoreDetail | null> {
  const store = await merchantScrapesPrisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      aggregator: true,
      externalId: true,
      slug: true,
      url: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!store) {
    return null;
  }

  // Resolved here rather than per-page: all six `[id]` detail routes call this.
  const brandRefs = await getBrandRefsByStoreIds([store.id]);

  return {
    id: store.id,
    name: store.name,
    aggregator: store.aggregator as AggregatorValue,
    externalId: store.externalId,
    slug: store.slug,
    url: store.url,
    createdAt: store.createdAt.toISOString(),
    updatedAt: store.updatedAt.toISOString(),
    brand: brandRefs.get(store.id) ?? null,
  };
}

/** Stores available to the filter bar, ordered by name. */
export async function listStores(
  aggregator: AggregatorValue | null,
): Promise<StoreRef[]> {
  const stores = await merchantScrapesPrisma.store.findMany({
    where: aggregator ? { aggregator } : {},
    select: { id: true, name: true, aggregator: true },
    orderBy: { name: "asc" },
  });

  return stores.map((store) => ({
    id: store.id,
    name: store.name,
    aggregator: store.aggregator as AggregatorValue,
  }));
}
