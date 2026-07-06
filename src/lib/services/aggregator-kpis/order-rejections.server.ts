import { merchantScrapesPrisma } from "$lib/server/merchant-scrapes-prisma";
import type {
  AggregatorValue,
  KpiFilters,
  RejectionRow,
  RejectionsView,
  TimeseriesPoint,
} from "$lib/services/aggregator-kpis/aggregator-kpis";
import {
  averageByDay,
  scrapedAtRange,
  storeWhere,
  toNumber,
} from "$lib/services/aggregator-kpis/kpi-shared.server";

/** Latest order-rejections snapshot per store, filtered by aggregator/store. */
export async function getRejectionsLatestByStore(
  filters: KpiFilters,
): Promise<RejectionRow[]> {
  const stores = await merchantScrapesPrisma.store.findMany({
    where: storeWhere(filters),
    select: {
      id: true,
      name: true,
      aggregator: true,
      snapshots: {
        where: { rejections: { isNot: null } },
        orderBy: { scrapedAt: "desc" },
        take: 1,
        select: {
          scrapedAt: true,
          rejections: {
            select: {
              cancellationsPct: true,
              lostSales: true,
              reasonUnknownCount: true,
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
      const rejections = snapshot?.rejections;

      return {
        storeId: store.id,
        storeName: store.name,
        aggregator: store.aggregator as AggregatorValue,
        scrapedAt: snapshot ? snapshot.scrapedAt.toISOString() : null,
        cancellationsPct: toNumber(rejections?.cancellationsPct),
        lostSales: toNumber(rejections?.lostSales),
        reasonUnknownCount: toNumber(rejections?.reasonUnknownCount),
      };
    });
}

/** Daily average cancellation percentage across the filtered stores. */
export async function getRejectionsTrend(
  filters: KpiFilters,
): Promise<TimeseriesPoint[]> {
  const range = scrapedAtRange(filters, { withDefaultWindow: true });

  const rows = await merchantScrapesPrisma.orderRejectionsSnapshot.findMany({
    where: {
      cancellationsPct: { not: null },
      snapshot: {
        ...(range ? { scrapedAt: range } : {}),
        store: storeWhere(filters),
      },
    },
    select: {
      cancellationsPct: true,
      snapshot: { select: { scrapedAt: true } },
    },
    orderBy: { snapshot: { scrapedAt: "asc" } },
  });

  return averageByDay(
    rows.map((row) => ({
      scrapedAt: row.snapshot.scrapedAt,
      value: toNumber(row.cancellationsPct),
    })),
  );
}

export async function getRejectionsView(
  filters: KpiFilters,
): Promise<RejectionsView> {
  const [rows, trend] = await Promise.all([
    getRejectionsLatestByStore(filters),
    getRejectionsTrend(filters),
  ]);

  return { rows, trend };
}
