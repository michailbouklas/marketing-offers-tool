/**
 * Server-only helpers shared by the aggregator-KPI services. Every query runs
 * against the merchant-scrapes Postgres database via `merchantScrapesPrisma`.
 */
import { merchantScrapesPrisma } from "$lib/server/merchant-scrapes-prisma";
import {
  aggregators,
  type AggregatorValue,
  type KpiFilters,
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

/** `where` fragment restricting a `Store` relation by the shared filters. */
export function storeWhere(filters: KpiFilters) {
  return {
    ...(filters.aggregator ? { aggregator: filters.aggregator } : {}),
    ...(filters.storeId ? { id: filters.storeId } : {}),
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
  from: z
    .preprocess(emptyToUndefined, z.string().regex(dayPattern).optional())
    .catch(undefined),
  to: z
    .preprocess(emptyToUndefined, z.string().regex(dayPattern).optional())
    .catch(undefined),
});

/** Parses the shared KPI filters (aggregator, store, date range) from a URL. */
export function parseKpiFilters(searchParams: URLSearchParams): KpiFilters {
  const result = kpiFiltersSchema.safeParse({
    aggregator: searchParams.get("aggregator") ?? undefined,
    storeId: searchParams.get("storeId") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const data = result.success ? result.data : {};

  return {
    aggregator: data.aggregator ?? null,
    storeId: data.storeId ?? null,
    from: data.from ?? null,
    to: data.to ?? null,
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
