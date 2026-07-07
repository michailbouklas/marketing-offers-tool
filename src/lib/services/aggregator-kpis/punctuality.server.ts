import { merchantScrapesPrisma } from "$lib/server/merchant-scrapes-prisma";
import type {
  AggregatorValue,
  KpiFilters,
  PunctualityRow,
  PunctualityStoreView,
  PunctualityView,
  TimeseriesPoint,
} from "$lib/services/aggregator-kpis/aggregator-kpis";
import {
  averageByDay,
  scrapedAtRange,
  storeWhere,
  toNumber,
} from "$lib/services/aggregator-kpis/kpi-shared.server";

/** Latest punctuality snapshot per store, filtered by aggregator/store. */
export async function getPunctualityLatestByStore(
  filters: KpiFilters,
): Promise<PunctualityRow[]> {
  const stores = await merchantScrapesPrisma.store.findMany({
    where: storeWhere(filters),
    select: {
      id: true,
      name: true,
      aggregator: true,
      snapshots: {
        where: { punctuality: { isNot: null } },
        orderBy: { scrapedAt: "desc" },
        take: 1,
        select: {
          scrapedAt: true,
          punctuality: {
            select: {
              avoidableWaitOrdersPct: true,
              avgAvoidableWaitSeconds: true,
              deliveredOrders: true,
              totalOrders: true,
            },
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
      const punctuality = snapshot?.punctuality;

      return {
        storeId: store.id,
        storeName: store.name,
        aggregator: store.aggregator as AggregatorValue,
        scrapedAt: snapshot ? snapshot.scrapedAt.toISOString() : null,
        avoidableWaitOrdersPct: toNumber(punctuality?.avoidableWaitOrdersPct),
        avgAvoidableWaitSeconds: toNumber(punctuality?.avgAvoidableWaitSeconds),
        deliveredOrders: toNumber(punctuality?.deliveredOrders),
        totalOrders: toNumber(punctuality?.totalOrders),
      };
    });
}

/** Daily average avoidable-wait-orders percentage across the filtered stores. */
export async function getPunctualityTrend(
  filters: KpiFilters,
): Promise<TimeseriesPoint[]> {
  const range = scrapedAtRange(filters, { withDefaultWindow: true });

  const rows = await merchantScrapesPrisma.punctualitySnapshot.findMany({
    where: {
      avoidableWaitOrdersPct: { not: null },
      snapshot: {
        ...(range ? { scrapedAt: range } : {}),
        store: storeWhere(filters),
      },
    },
    select: {
      avoidableWaitOrdersPct: true,
      snapshot: { select: { scrapedAt: true } },
    },
    orderBy: { snapshot: { scrapedAt: "asc" } },
  });

  return averageByDay(
    rows.map((row) => ({
      scrapedAt: row.snapshot.scrapedAt,
      value: toNumber(row.avoidableWaitOrdersPct),
    })),
  );
}

/**
 * Full punctuality history for one store (every captured snapshot, newest
 * first) plus a daily-average avoidable-wait-orders trend derived from that
 * same history. Querying `punctualitySnapshot` directly means only snapshots
 * that actually have punctuality data are returned — a missing snapshot is "no
 * data", never a real 0.
 */
export async function getPunctualityStoreView(
  storeId: number,
): Promise<PunctualityStoreView> {
  const rows = await merchantScrapesPrisma.punctualitySnapshot.findMany({
    where: { snapshot: { store: { id: storeId } } },
    select: {
      avoidableWaitOrdersPct: true,
      avgAvoidableWaitSeconds: true,
      deliveredOrders: true,
      totalOrders: true,
      snapshot: { select: { scrapedAt: true, runId: true } },
    },
    orderBy: { snapshot: { scrapedAt: "desc" } },
  });

  const points = rows.map((row) => ({
    scrapedAt: row.snapshot.scrapedAt.toISOString(),
    avoidableWaitOrdersPct: toNumber(row.avoidableWaitOrdersPct),
    avgAvoidableWaitSeconds: toNumber(row.avgAvoidableWaitSeconds),
    deliveredOrders: toNumber(row.deliveredOrders),
    totalOrders: toNumber(row.totalOrders),
    runId: row.snapshot.runId,
  }));

  const trend = averageByDay(
    rows.map((row) => ({
      scrapedAt: row.snapshot.scrapedAt,
      value: toNumber(row.avoidableWaitOrdersPct),
    })),
  );

  return { points, trend };
}

export async function getPunctualityView(
  filters: KpiFilters,
): Promise<PunctualityView> {
  const [rows, trend] = await Promise.all([
    getPunctualityLatestByStore(filters),
    getPunctualityTrend(filters),
  ]);

  return { rows, trend };
}
