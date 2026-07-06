import { merchantScrapesPrisma } from "$lib/server/merchant-scrapes-prisma";
import type {
  AggregatorValue,
  ClosureRow,
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

export async function getClosuresView(
  filters: KpiFilters,
): Promise<ClosuresView> {
  const [rows, trend] = await Promise.all([
    getClosuresLatestByStore(filters),
    getClosuresTrend(filters),
  ]);

  return { rows, trend };
}
