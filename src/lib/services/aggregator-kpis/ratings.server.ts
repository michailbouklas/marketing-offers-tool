import { merchantScrapesPrisma } from "$lib/server/merchant-scrapes-prisma";
import type {
  AggregatorValue,
  KpiFilters,
  RatingRow,
  RatingsView,
  StarBucket,
  TimeseriesPoint,
} from "$lib/services/aggregator-kpis/aggregator-kpis";
import {
  averageByDay,
  scrapedAtRange,
  storeWhere,
  toNumber,
} from "$lib/services/aggregator-kpis/kpi-shared.server";

/** Latest rating snapshot per store, filtered by aggregator/store. */
export async function getRatingsLatestByStore(
  filters: KpiFilters,
): Promise<RatingRow[]> {
  const stores = await merchantScrapesPrisma.store.findMany({
    where: storeWhere(filters),
    select: {
      id: true,
      name: true,
      aggregator: true,
      snapshots: {
        where: { rating: { isNot: null } },
        orderBy: { scrapedAt: "desc" },
        take: 1,
        select: {
          scrapedAt: true,
          rating: {
            select: { storeRating: true, totalReviews: true },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return stores
    .filter((store) => store.snapshots.length > 0)
    .map((store) => {
      const snapshot = store.snapshots[0];
      const rating = snapshot?.rating;

      return {
        storeId: store.id,
        storeName: store.name,
        aggregator: store.aggregator as AggregatorValue,
        scrapedAt: snapshot ? snapshot.scrapedAt.toISOString() : null,
        storeRating: toNumber(rating?.storeRating),
        totalReviews: toNumber(rating?.totalReviews),
      };
    });
}

/** Daily average store rating across the filtered stores. */
export async function getRatingsTrend(
  filters: KpiFilters,
): Promise<TimeseriesPoint[]> {
  const range = scrapedAtRange(filters, { withDefaultWindow: true });

  const rows = await merchantScrapesPrisma.ratingSnapshot.findMany({
    where: {
      storeRating: { not: null },
      snapshot: {
        ...(range ? { scrapedAt: range } : {}),
        store: storeWhere(filters),
      },
    },
    select: {
      storeRating: true,
      snapshot: { select: { scrapedAt: true } },
    },
    orderBy: { snapshot: { scrapedAt: "asc" } },
  });

  return averageByDay(
    rows.map((row) => ({
      scrapedAt: row.snapshot.scrapedAt,
      value: toNumber(row.storeRating),
    })),
  );
}

/**
 * Star-bucket distribution summed across the latest rating snapshot per store.
 * Always returns buckets for stars 1..5 so the chart renders a stable axis.
 */
export async function getRatingsDistribution(
  filters: KpiFilters,
): Promise<StarBucket[]> {
  const stores = await merchantScrapesPrisma.store.findMany({
    where: storeWhere(filters),
    select: {
      snapshots: {
        where: { rating: { isNot: null } },
        orderBy: { scrapedAt: "desc" },
        take: 1,
        select: {
          rating: {
            select: {
              buckets: { select: { stars: true, count: true } },
            },
          },
        },
      },
    },
  });

  const totals = new Map<number, number>([
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
    [5, 0],
  ]);

  for (const store of stores) {
    const buckets = store.snapshots[0]?.rating?.buckets ?? [];

    for (const bucket of buckets) {
      if (!totals.has(bucket.stars)) {
        continue;
      }

      totals.set(
        bucket.stars,
        (totals.get(bucket.stars) ?? 0) + (bucket.count ?? 0),
      );
    }
  }

  return [...totals.entries()]
    .sort(([a], [b]) => a - b)
    .map(([stars, count]) => ({ stars, count }));
}

export async function getRatingsView(
  filters: KpiFilters,
): Promise<RatingsView> {
  const [rows, trend, distribution] = await Promise.all([
    getRatingsLatestByStore(filters),
    getRatingsTrend(filters),
    getRatingsDistribution(filters),
  ]);

  return { rows, trend, distribution };
}
