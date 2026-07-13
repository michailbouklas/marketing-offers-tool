import { merchantScrapesPrisma } from "$lib/server/merchant-scrapes-prisma";
import { Prisma } from "../../../generated/merchant-scrapes-prisma/client";
import type {
  AggregatorValue,
  KpiFilters,
  PeriodFilters,
  PeriodKind,
  PeriodPoint,
  PunctualityPeriodStoreView,
  PunctualityPeriodView,
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
import {
  PERIOD_TREND_LIMIT,
  periodDaysSql,
  storeFilterSql,
} from "$lib/services/aggregator-kpis/period-shared.server";

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

// --- Period-based reads (Foody foody_punctuality_by_period view) ---

/** Raw shape of a punctuality period row. */
type PunctualityPeriodRawRow = {
  storeId: number;
  storeName: string | null;
  periodStart: string;
  periodEnd: string;
  periodDays: number;
  scrapedAt: string | null;
  avoidableWaitOrdersPct: unknown;
  avgAvoidableWaitSeconds: unknown;
  deliveredOrders: unknown;
  totalOrders: unknown;
};

function mapPunctualityPeriodRow(row: PunctualityPeriodRawRow): PunctualityRow {
  return {
    storeId: row.storeId,
    storeName: row.storeName,
    aggregator: "FOODY",
    scrapedAt: row.scrapedAt,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    periodDays: row.periodDays,
    avoidableWaitOrdersPct: toNumber(row.avoidableWaitOrdersPct),
    avgAvoidableWaitSeconds: toNumber(row.avgAvoidableWaitSeconds),
    deliveredOrders: toNumber(row.deliveredOrders),
    totalOrders: toNumber(row.totalOrders),
  };
}

const punctualityColumnsSql = Prisma.sql`
  "periodStart"::text        AS "periodStart",
  "periodEnd"::text          AS "periodEnd",
  period_days                AS "periodDays",
  "scrapedAt"::text          AS "scrapedAt",
  "avoidableWaitOrdersPct"   AS "avoidableWaitOrdersPct",
  "avgAvoidableWaitSeconds"  AS "avgAvoidableWaitSeconds",
  "deliveredOrders"          AS "deliveredOrders",
  "totalOrders"              AS "totalOrders"`;

/**
 * Order-weighted avoidable-wait order % per period across the scope (rule 2):
 * weight each store's percentage by its `totalOrders`.
 */
async function getPunctualityPeriodTrend(
  period: PeriodKind,
  storeId: number | null,
): Promise<PeriodPoint[]> {
  const rows = await merchantScrapesPrisma.$queryRaw<
    {
      periodStart: string;
      periodEnd: string;
      periodDays: number;
      pct: unknown;
    }[]
  >(
    Prisma.sql`
      SELECT "periodStart", "periodEnd", "periodDays", pct
      FROM (
        SELECT "periodStart"::text AS "periodStart",
               "periodEnd"::text   AS "periodEnd",
               period_days         AS "periodDays",
               100 * SUM("avoidableWaitOrdersPct" / 100.0 * "totalOrders")
                   / NULLIF(SUM("totalOrders"), 0) AS pct
        FROM foody_punctuality_by_period
        WHERE ${periodDaysSql(period)} ${storeFilterSql(storeId)}
          AND "avoidableWaitOrdersPct" IS NOT NULL AND "totalOrders" IS NOT NULL
        GROUP BY "periodStart", "periodEnd", period_days
        ORDER BY "periodStart" DESC
        LIMIT ${PERIOD_TREND_LIMIT[period]}
      ) t
      ORDER BY "periodStart" ASC`,
  );

  return rows
    .map((row) => {
      const value = toNumber(row.pct);
      return value === null
        ? null
        : {
            periodStart: row.periodStart,
            periodEnd: row.periodEnd,
            periodDays: row.periodDays,
            value,
          };
    })
    .filter((point): point is PeriodPoint => point !== null);
}

/** Latest completed period's punctuality per store within the scope. */
async function getPunctualityLatestPeriodRows(
  period: PeriodKind,
  storeId: number | null,
): Promise<PunctualityRow[]> {
  const rows = await merchantScrapesPrisma.$queryRaw<PunctualityPeriodRawRow[]>(
    Prisma.sql`
      WITH latest AS (
        SELECT MAX("periodStart") AS ps
        FROM foody_punctuality_by_period
        WHERE ${periodDaysSql(period)} ${storeFilterSql(storeId)}
      )
      SELECT v."storeId" AS "storeId", v.name AS "storeName", ${punctualityColumnsSql}
      FROM foody_punctuality_by_period v
      JOIN latest ON v."periodStart" = latest.ps
      WHERE ${periodDaysSql(period)} ${storeFilterSql(storeId)}
      ORDER BY v.name ASC`,
  );

  return rows.map(mapPunctualityPeriodRow);
}

/** Full punctuality period history for one store, newest first. */
async function getPunctualityPeriodHistory(
  period: PeriodKind,
  storeId: number,
): Promise<PunctualityRow[]> {
  const rows = await merchantScrapesPrisma.$queryRaw<PunctualityPeriodRawRow[]>(
    Prisma.sql`
      SELECT "storeId" AS "storeId", name AS "storeName", ${punctualityColumnsSql}
      FROM foody_punctuality_by_period
      WHERE ${periodDaysSql(period)} AND "storeId" = ${storeId}
      ORDER BY "periodStart" DESC
      LIMIT ${PERIOD_TREND_LIMIT[period]}`,
  );

  return rows.map(mapPunctualityPeriodRow);
}

/** Punctuality period view: latest-period rows + order-weighted trend. */
export async function getPunctualityPeriodView(
  filters: PeriodFilters,
): Promise<PunctualityPeriodView> {
  const [rows, trend] = await Promise.all([
    getPunctualityLatestPeriodRows(filters.period, filters.storeId),
    getPunctualityPeriodTrend(filters.period, filters.storeId),
  ]);

  return { period: filters.period, rows, trend };
}

/** Per-store punctuality period history + a trend derived from it. */
export async function getPunctualityPeriodStoreView(
  storeId: number,
  period: PeriodKind,
): Promise<PunctualityPeriodStoreView> {
  const [rows, trend] = await Promise.all([
    getPunctualityPeriodHistory(period, storeId),
    getPunctualityPeriodTrend(period, storeId),
  ]);

  return { period, rows, trend };
}
