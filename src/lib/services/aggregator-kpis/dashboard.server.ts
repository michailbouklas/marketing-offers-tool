import { merchantScrapesPrisma } from "$lib/server/merchant-scrapes-prisma";
import {
  type BrandScopeFilters,
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

/**
 * Headline numbers for the `/aggregator-kpis` landing page. Store counts come
 * from cheap `groupBy`/`count` queries; the KPI averages reuse each section's
 * latest-per-store loader so the numbers match what the sub-routes show.
 *
 * `scope` narrows every number to a brand's stores (already resolved by
 * `withBrandStores`). An empty `storeIds` means the brand owns no store, so all
 * counts legitimately come back zero.
 */
export async function getDashboardStats(
  scope: BrandScopeFilters,
): Promise<KpiDashboardStats> {
  const all: KpiFilters = {
    aggregator: null,
    storeId: null,
    from: null,
    to: null,
    ...scope,
  };
  // Both count queries share the brand's store set; null means "no filter".
  const storeIdWhere =
    scope.storeIds !== null ? { id: { in: scope.storeIds } } : {};

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
      where: storeIdWhere,
      _count: { _all: true },
    }),
    merchantScrapesPrisma.review.count({
      where: scope.storeIds !== null ? { store: storeIdWhere } : {},
    }),
    getClosuresLatestByStore(all),
    getRejectionsLatestByStore(all),
    getPunctualityLatestByStore(all),
    getRatingsLatestByStore(all),
    getMetricsView({ storeId: null, period: "week", ...scope }),
    getProGrowthLatestRows(scope),
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
