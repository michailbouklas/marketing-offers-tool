import { merchantScrapesPrisma } from "$lib/server/merchant-scrapes-prisma";
import type {
  AggregatorValue,
  ClosureRow,
  ClosuresStoreView,
  ClosuresView,
  KpiFilters,
  TimeseriesPoint,
} from "$lib/services/aggregator-kpis/aggregator-kpis";
import {
  averageByDay,
  scrapedAtRange,
  storeWhere,
  toNumber,
} from "$lib/services/aggregator-kpis/kpi-shared.server";

/** Latest closures snapshot per store, filtered by aggregator/store. */
export async function getClosuresLatestByStore(
  filters: KpiFilters,
): Promise<ClosureRow[]> {
  const stores = await merchantScrapesPrisma.store.findMany({
    where: storeWhere(filters),
    select: {
      id: true,
      name: true,
      aggregator: true,
      snapshots: {
        where: { closures: { isNot: null } },
        orderBy: { scrapedAt: "desc" },
        take: 1,
        select: {
          scrapedAt: true,
          closures: {
            select: { offlineOpenHoursPct: true, unreachableSeconds: true },
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
      const closures = snapshot?.closures;

      return {
        storeId: store.id,
        storeName: store.name,
        aggregator: store.aggregator as AggregatorValue,
        scrapedAt: snapshot ? snapshot.scrapedAt.toISOString() : null,
        offlineOpenHoursPct: toNumber(closures?.offlineOpenHoursPct),
        unreachableSeconds: toNumber(closures?.unreachableSeconds),
      };
    });
}

/** Daily average offline-open-hours percentage across the filtered stores. */
export async function getClosuresTrend(
  filters: KpiFilters,
): Promise<TimeseriesPoint[]> {
  const range = scrapedAtRange(filters, { withDefaultWindow: true });

  const rows = await merchantScrapesPrisma.closuresSnapshot.findMany({
    where: {
      offlineOpenHoursPct: { not: null },
      snapshot: {
        ...(range ? { scrapedAt: range } : {}),
        store: storeWhere(filters),
      },
    },
    select: {
      offlineOpenHoursPct: true,
      snapshot: { select: { scrapedAt: true } },
    },
    orderBy: { snapshot: { scrapedAt: "asc" } },
  });

  return averageByDay(
    rows.map((row) => ({
      scrapedAt: row.snapshot.scrapedAt,
      value: toNumber(row.offlineOpenHoursPct),
    })),
  );
}

/**
 * Full closures history for one store (every captured snapshot, newest first)
 * plus a daily-average offline-open-hours trend derived from that same history.
 * Querying `closuresSnapshot` directly means only snapshots that actually have
 * closures data are returned — a missing snapshot is "no data", never a real 0.
 */
export async function getClosuresStoreView(
  storeId: number,
): Promise<ClosuresStoreView> {
  const rows = await merchantScrapesPrisma.closuresSnapshot.findMany({
    where: { snapshot: { store: { id: storeId } } },
    select: {
      offlineOpenHoursPct: true,
      unreachableSeconds: true,
      snapshot: { select: { scrapedAt: true, runId: true } },
    },
    orderBy: { snapshot: { scrapedAt: "desc" } },
  });

  const points = rows.map((row) => ({
    scrapedAt: row.snapshot.scrapedAt.toISOString(),
    offlineOpenHoursPct: toNumber(row.offlineOpenHoursPct),
    unreachableSeconds: toNumber(row.unreachableSeconds),
    runId: row.snapshot.runId,
  }));

  const trend = averageByDay(
    rows.map((row) => ({
      scrapedAt: row.snapshot.scrapedAt,
      value: toNumber(row.offlineOpenHoursPct),
    })),
  );

  return { points, trend };
}

export async function getClosuresView(
  filters: KpiFilters,
): Promise<ClosuresView> {
  const [rows, trend] = await Promise.all([
    getClosuresLatestByStore(filters),
    getClosuresTrend(filters),
  ]);

  return { rows, trend };
}
