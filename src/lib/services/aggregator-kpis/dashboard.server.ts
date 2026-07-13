import { merchantScrapesPrisma } from "$lib/server/merchant-scrapes-prisma";
import {
  type KpiDashboardStats,
  type KpiFilters,
  proOrderShare,
} from "$lib/services/aggregator-kpis/aggregator-kpis";
import { getClosuresLatestByStore } from "$lib/services/aggregator-kpis/closures.server";
import { averageOf } from "$lib/services/aggregator-kpis/kpi-shared.server";
import { getMetricsView } from "$lib/services/aggregator-kpis/metrics.server";
import { getRejectionsLatestByStore } from "$lib/services/aggregator-kpis/order-rejections.server";
import { getProGrowthLatestRows } from "$lib/services/aggregator-kpis/pro-growth.server";
import { getPunctualityLatestByStore } from "$lib/services/aggregator-kpis/punctuality.server";
import { getRatingsLatestByStore } from "$lib/services/aggregator-kpis/ratings.server";

/** Unfiltered filters: the landing dashboard summarizes across all stores. */
const ALL: KpiFilters = {
  aggregator: null,
  storeId: null,
  from: null,
  to: null,
};

/**
 * Headline numbers for the `/aggregator-kpis` landing page. Store counts come
 * from cheap `groupBy`/`count` queries; the KPI averages reuse each section's
 * latest-per-store loader so the numbers match what the sub-routes show.
 */
export async function getDashboardStats(): Promise<KpiDashboardStats> {
  const [
    storesByAggregator,
    totalReviews,
    closures,
    rejections,
    punctuality,
    ratings,
    metrics,
    proGrowth,
  ] = await Promise.all([
    merchantScrapesPrisma.store.groupBy({
      by: ["aggregator"],
      _count: { _all: true },
    }),
    merchantScrapesPrisma.review.count(),
    getClosuresLatestByStore(ALL),
    getRejectionsLatestByStore(ALL),
    getPunctualityLatestByStore(ALL),
    getRatingsLatestByStore(ALL),
    getMetricsView({ storeId: null, period: "week" }),
    getProGrowthLatestRows(),
  ]);

  const countFor = (aggregator: string) =>
    storesByAggregator.find((group) => group.aggregator === aggregator)?._count
      ._all ?? 0;

  const foodyCount = countFor("FOODY");
  const woltCount = countFor("WOLT");

  return {
    storeCount: foodyCount + woltCount,
    foodyCount,
    woltCount,
    totalReviews,
    avgStoreRating: averageOf(ratings.map((row) => row.storeRating)),
    avgOfflineOpenHoursPct: averageOf(
      closures.map((row) => row.offlineOpenHoursPct),
    ),
    avgCancellationsPct: averageOf(
      rejections.map((row) => row.cancellationsPct),
    ),
    avgAvoidableWaitOrdersPct: averageOf(
      punctuality.map((row) => row.avoidableWaitOrdersPct),
    ),
    latestFoodyWeeklySales: metrics.totals.sales,
    proOrderSharePct: proOrderShare(proGrowth),
  };
}
