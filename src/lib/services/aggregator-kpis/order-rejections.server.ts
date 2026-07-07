import { merchantScrapesPrisma } from "$lib/server/merchant-scrapes-prisma";
import type {
  AggregatorValue,
  KpiFilters,
  RejectionRow,
  RejectionsStoreView,
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

/**
 * Full order-rejections history for one store (every captured snapshot, newest
 * first) plus a daily-average cancellation trend derived from that same
 * history. Querying `orderRejectionsSnapshot` directly means only snapshots
 * that actually have rejections data are returned — a missing snapshot is "no
 * data", never a real 0.
 */
export async function getRejectionsStoreView(
  storeId: number,
): Promise<RejectionsStoreView> {
  const rows = await merchantScrapesPrisma.orderRejectionsSnapshot.findMany({
    where: { snapshot: { store: { id: storeId } } },
    select: {
      cancellationsPct: true,
      lostSales: true,
      reasonUnknownCount: true,
      snapshot: { select: { scrapedAt: true, runId: true } },
    },
    orderBy: { snapshot: { scrapedAt: "desc" } },
  });

  const points = rows.map((row) => ({
    scrapedAt: row.snapshot.scrapedAt.toISOString(),
    cancellationsPct: toNumber(row.cancellationsPct),
    lostSales: toNumber(row.lostSales),
    reasonUnknownCount: toNumber(row.reasonUnknownCount),
    runId: row.snapshot.runId,
  }));

  const trend = averageByDay(
    rows.map((row) => ({
      scrapedAt: row.snapshot.scrapedAt,
      value: toNumber(row.cancellationsPct),
    })),
  );

  return { points, trend };
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
