/**
 * Foody sales / orders / basket metrics, read from `foody_metrics_by_period`.
 * One row per (storeId, periodStart, periodEnd); the view already dedupes
 * re-scrapes (latest wins) and excludes legacy null-period rows. Company-wide
 * `avgBasketSize` is recomputed as SUM(sales)/SUM(orders) — never the mean of
 * per-store ratios (spec rule 2).
 */
import { merchantScrapesPrisma } from "$lib/server/merchant-scrapes-prisma";
import { Prisma } from "../../../generated/merchant-scrapes-prisma/client";
import type {
  MetricRow,
  MetricsStoreView,
  MetricsTotals,
  MetricsView,
  PeriodFilters,
  PeriodKind,
  PeriodPoint,
} from "$lib/services/aggregator-kpis/aggregator-kpis";
import { toNumber } from "$lib/services/aggregator-kpis/kpi-shared.server";
import {
  PERIOD_TREND_LIMIT,
  periodDaysSql,
  storeFilterSql,
} from "$lib/services/aggregator-kpis/period-shared.server";

/** Raw shape of a per-store metrics row (dates cast to text in SQL). */
type MetricRawRow = {
  storeId: number;
  storeName: string | null;
  periodStart: string;
  periodEnd: string;
  periodDays: number;
  sales: unknown;
  orders: unknown;
  avgBasketSize: unknown;
  avgBasketItems: unknown;
  completedOrders: unknown;
};

/** Raw shape of a per-period aggregate row. */
type PeriodAggRawRow = {
  periodStart: string;
  periodEnd: string;
  periodDays: number;
  sales: unknown;
  orders: unknown;
};

function mapMetricRow(row: MetricRawRow): MetricRow {
  return {
    storeId: row.storeId,
    storeName: row.storeName,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    periodDays: row.periodDays,
    sales: toNumber(row.sales),
    orders: toNumber(row.orders),
    avgBasketSize: toNumber(row.avgBasketSize),
    avgBasketItems: toNumber(row.avgBasketItems),
    completedOrders: toNumber(row.completedOrders),
  };
}

/** Per-period SUM trends (sales, orders) across the store scope, ascending. */
async function periodSumTrends(
  filters: PeriodFilters,
): Promise<{ sales: PeriodPoint[]; orders: PeriodPoint[] }> {
  const rows = await merchantScrapesPrisma.$queryRaw<PeriodAggRawRow[]>(
    Prisma.sql`
      SELECT "periodStart", "periodEnd", "periodDays", sales, orders
      FROM (
        SELECT "periodStart"::text AS "periodStart",
               "periodEnd"::text   AS "periodEnd",
               period_days         AS "periodDays",
               SUM(sales)          AS sales,
               SUM(orders)         AS orders
        FROM foody_metrics_by_period
        WHERE ${periodDaysSql(filters.period)} ${storeFilterSql(filters.storeId)}
        GROUP BY "periodStart", "periodEnd", period_days
        ORDER BY "periodStart" DESC
        LIMIT ${PERIOD_TREND_LIMIT[filters.period]}
      ) t
      ORDER BY "periodStart" ASC`,
  );

  const sales: PeriodPoint[] = [];
  const orders: PeriodPoint[] = [];

  for (const row of rows) {
    const salesValue = toNumber(row.sales);
    const ordersValue = toNumber(row.orders);
    const base = {
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      periodDays: row.periodDays,
    };

    if (salesValue !== null) {
      sales.push({ ...base, value: salesValue });
    }
    if (ordersValue !== null) {
      orders.push({ ...base, value: ordersValue });
    }
  }

  return { sales, orders };
}

/** Per-store rows for the latest closed period within the scope. */
async function latestPeriodRows(filters: PeriodFilters): Promise<MetricRow[]> {
  const rows = await merchantScrapesPrisma.$queryRaw<MetricRawRow[]>(
    Prisma.sql`
      WITH latest AS (
        SELECT MAX("periodStart") AS ps
        FROM foody_metrics_by_period
        WHERE ${periodDaysSql(filters.period)} ${storeFilterSql(filters.storeId)}
      )
      SELECT v."storeId"                 AS "storeId",
             v.name                      AS "storeName",
             v."periodStart"::text       AS "periodStart",
             v."periodEnd"::text         AS "periodEnd",
             v.period_days               AS "periodDays",
             v.sales                     AS sales,
             v.orders                    AS orders,
             v."avgBasketSize"           AS "avgBasketSize",
             v."avgBasketItems"          AS "avgBasketItems",
             v."completedOrders"         AS "completedOrders"
      FROM foody_metrics_by_period v
      JOIN latest ON v."periodStart" = latest.ps
      WHERE ${periodDaysSql(filters.period)} ${storeFilterSql(filters.storeId)}
      ORDER BY v.name ASC`,
  );

  return rows.map(mapMetricRow);
}

/** Recomputes company-wide totals from the latest-period rows (rule 2). */
function totalsFromRows(rows: MetricRow[]): MetricsTotals {
  if (rows.length === 0) {
    return {
      periodStart: null,
      periodEnd: null,
      periodDays: null,
      sales: null,
      orders: null,
      completedOrders: null,
      avgBasketSize: null,
      storeCount: 0,
    };
  }

  let sales = 0;
  let hasSales = false;
  let orders = 0;
  let hasOrders = false;
  let completed = 0;
  let hasCompleted = false;

  for (const row of rows) {
    if (row.sales !== null) {
      sales += row.sales;
      hasSales = true;
    }
    if (row.orders !== null) {
      orders += row.orders;
      hasOrders = true;
    }
    if (row.completedOrders !== null) {
      completed += row.completedOrders;
      hasCompleted = true;
    }
  }

  return {
    periodStart: rows[0].periodStart,
    periodEnd: rows[0].periodEnd,
    periodDays: rows[0].periodDays,
    sales: hasSales ? sales : null,
    orders: hasOrders ? orders : null,
    completedOrders: hasCompleted ? completed : null,
    avgBasketSize: hasSales && hasOrders && orders > 0 ? sales / orders : null,
    storeCount: rows.length,
  };
}

/** Company-wide (or single-store) metrics view for the chosen period lane. */
export async function getMetricsView(
  filters: PeriodFilters,
): Promise<MetricsView> {
  const [trends, rows] = await Promise.all([
    periodSumTrends(filters),
    latestPeriodRows(filters),
  ]);

  return {
    period: filters.period,
    totals: totalsFromRows(rows),
    salesTrend: trends.sales,
    ordersTrend: trends.orders,
    rows,
  };
}

/** Full period history + derived trends for one store. */
export async function getMetricsStoreView(
  storeId: number,
  period: PeriodKind,
): Promise<MetricsStoreView> {
  const rows = await merchantScrapesPrisma.$queryRaw<MetricRawRow[]>(
    Prisma.sql`
      SELECT "storeId"            AS "storeId",
             name                 AS "storeName",
             "periodStart"::text  AS "periodStart",
             "periodEnd"::text    AS "periodEnd",
             period_days          AS "periodDays",
             sales                AS sales,
             orders               AS orders,
             "avgBasketSize"      AS "avgBasketSize",
             "avgBasketItems"     AS "avgBasketItems",
             "completedOrders"    AS "completedOrders"
      FROM foody_metrics_by_period
      WHERE ${periodDaysSql(period)} AND "storeId" = ${storeId}
      ORDER BY "periodStart" DESC
      LIMIT ${PERIOD_TREND_LIMIT[period]}`,
  );

  const points = rows.map(mapMetricRow);
  // History is newest-first; trends read left-to-right oldest-first.
  const ascending = [...points].reverse();

  const trendPoint = (row: MetricRow, value: number | null) =>
    value === null
      ? null
      : {
          periodStart: row.periodStart,
          periodEnd: row.periodEnd,
          periodDays: row.periodDays,
          value,
        };

  const collect = (pick: (row: MetricRow) => number | null): PeriodPoint[] =>
    ascending
      .map((row) => trendPoint(row, pick(row)))
      .filter((point): point is PeriodPoint => point !== null);

  return {
    period,
    latest: points[0] ?? null,
    salesTrend: collect((row) => row.sales),
    ordersTrend: collect((row) => row.orders),
    basketTrend: collect((row) => row.avgBasketSize),
    points,
  };
}
