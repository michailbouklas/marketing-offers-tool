import { merchantScrapesPrisma } from "$lib/server/merchant-scrapes-prisma";
import { Prisma } from "../../../generated/merchant-scrapes-prisma/client";
import type {
  AggregatorValue,
  CancellationReasonBreakdown,
  KpiFilters,
  LostSalesByReasonRow,
  PeriodFilters,
  PeriodKind,
  PeriodPoint,
  ReasonSlice,
  ReasonTrend,
  RejectionRow,
  RejectionsPeriodStoreView,
  RejectionsPeriodView,
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
import {
  PERIOD_TREND_LIMIT,
  periodDaysSql,
  storeFilterSql,
} from "$lib/services/aggregator-kpis/period-shared.server";

/** Reason rows -> value slices (count or €), non-null only, sorted desc. */
function toReasonSlices(
  reasons: { reason: string; value: unknown }[],
): ReasonSlice[] {
  return reasons
    .map((row) => ({ reason: row.reason, value: toNumber(row.value) }))
    .filter((slice): slice is ReasonSlice => slice.value !== null)
    .sort((a, b) => b.value - a.value);
}

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
              cancellationsCount: true,
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
        cancellationsCount: toNumber(rejections?.cancellationsCount),
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
 * Latest-snapshot cancellation reason breakdown for one store. Uses the latest
 * order-rejections snapshot that exists (rows are written only for ok/partial
 * sections, so `findFirst` here is inherently "latest where the child exists").
 * Totals come from the headline columns, not from summing the reason rows; an
 * empty reason list is a legitimate zero. Returns null when the store has no
 * rejections snapshot at all. `cancellationsCount === null` on the result means
 * reason data was never captured (pre-2026-07-09) — callers gate on that.
 */
export async function getCancellationReasonBreakdown(
  storeId: number,
): Promise<CancellationReasonBreakdown | null> {
  const snapshot =
    await merchantScrapesPrisma.orderRejectionsSnapshot.findFirst({
      where: { snapshot: { store: { id: storeId } } },
      orderBy: { snapshot: { scrapedAt: "desc" } },
      select: {
        cancellationsPct: true,
        cancellationsCount: true,
        lostSales: true,
        snapshot: { select: { scrapedAt: true } },
        reasons: {
          select: { reason: true, cancellations: true, salesLoss: true },
        },
      },
    });

  if (!snapshot) {
    return null;
  }

  return {
    scrapedAt: snapshot.snapshot.scrapedAt.toISOString(),
    cancellationsCount: toNumber(snapshot.cancellationsCount),
    cancellationsPct: toNumber(snapshot.cancellationsPct),
    lostSales: toNumber(snapshot.lostSales),
    byCount: toReasonSlices(
      snapshot.reasons.map((r) => ({
        reason: r.reason,
        value: r.cancellations,
      })),
    ),
    bySalesLoss: toReasonSlices(
      snapshot.reasons.map((r) => ({ reason: r.reason, value: r.salesLoss })),
    ),
  };
}

/**
 * Cancellation counts per reason over time for one store. Only snapshots that
 * captured reason rows are included (the 2026-07-09 cutover gate), so the caller
 * gets an empty series set for stores with only legacy history. Reasons are
 * assigned stable synthetic keys (`r0`, `r1`, …) ordered by total desc, so a
 * reason keeps its key/color across the chart's series and stacks.
 */
export async function getCancellationReasonTrend(
  storeId: number,
): Promise<ReasonTrend> {
  const rows = await merchantScrapesPrisma.orderRejectionsSnapshot.findMany({
    where: { snapshot: { store: { id: storeId } }, reasons: { some: {} } },
    select: {
      snapshot: { select: { scrapedAt: true } },
      reasons: { select: { reason: true, cancellations: true } },
    },
    orderBy: { snapshot: { scrapedAt: "asc" } },
  });

  // Total per reason, to order series (and thus colors) largest-first.
  const totals = new Map<string, number>();
  for (const row of rows) {
    for (const reason of row.reasons) {
      const value = toNumber(reason.cancellations);
      if (value !== null) {
        totals.set(reason.reason, (totals.get(reason.reason) ?? 0) + value);
      }
    }
  }

  const orderedReasons = [...totals.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([reason]) => reason);
  const keyByReason = new Map(
    orderedReasons.map((reason, index) => [reason, `r${index}`]),
  );

  const series = orderedReasons.map((reason) => ({
    key: keyByReason.get(reason) as string,
    label: reason,
  }));

  const points = rows.map((row) => {
    const values: Record<string, number> = {};
    for (const reason of row.reasons) {
      const value = toNumber(reason.cancellations);
      const key = keyByReason.get(reason.reason);
      if (value !== null && key) {
        values[key] = (values[key] ?? 0) + value;
      }
    }
    return { scrapedAt: row.snapshot.scrapedAt.toISOString(), values };
  });

  return { series, points };
}

/**
 * Cross-store lost sales grouped by cancellation reason. For each filtered store
 * we take its latest rejections snapshot (where the child exists), then sum
 * `salesLoss` per reason across stores and count how many stores contributed.
 * Respects the aggregator/store filters; sorted by € desc.
 */
export async function getLostSalesByReason(
  filters: KpiFilters,
): Promise<LostSalesByReasonRow[]> {
  const stores = await merchantScrapesPrisma.store.findMany({
    where: storeWhere(filters),
    select: {
      id: true,
      snapshots: {
        where: { rejections: { isNot: null } },
        orderBy: { scrapedAt: "desc" },
        take: 1,
        select: {
          rejections: {
            select: { reasons: { select: { reason: true, salesLoss: true } } },
          },
        },
      },
    },
  });

  const totals = new Map<string, { salesLoss: number; stores: Set<number> }>();

  for (const store of stores) {
    const reasons = store.snapshots[0]?.rejections?.reasons ?? [];
    for (const row of reasons) {
      const value = toNumber(row.salesLoss);
      if (value === null || value <= 0) {
        continue;
      }
      const bucket = totals.get(row.reason) ?? {
        salesLoss: 0,
        stores: new Set<number>(),
      };
      bucket.salesLoss += value;
      bucket.stores.add(store.id);
      totals.set(row.reason, bucket);
    }
  }

  return [...totals.entries()]
    .map(([reason, bucket]) => ({
      reason,
      salesLoss: bucket.salesLoss,
      storeCount: bucket.stores.size,
    }))
    .sort((a, b) => b.salesLoss - a.salesLoss);
}

/**
 * Full order-rejections history for one store (every captured snapshot, newest
 * first) plus a daily-average cancellation trend derived from that same
 * history, the latest-snapshot reason breakdown, and cancellation-reason totals
 * over time. Querying `orderRejectionsSnapshot` directly means only snapshots
 * that actually have rejections data are returned — a missing snapshot is "no
 * data", never a real 0.
 */
export async function getRejectionsStoreView(
  storeId: number,
): Promise<RejectionsStoreView> {
  const [rows, reasonBreakdown, reasonTrend] = await Promise.all([
    merchantScrapesPrisma.orderRejectionsSnapshot.findMany({
      where: { snapshot: { store: { id: storeId } } },
      select: {
        cancellationsPct: true,
        cancellationsCount: true,
        lostSales: true,
        reasonUnknownCount: true,
        snapshot: { select: { scrapedAt: true, runId: true } },
      },
      orderBy: { snapshot: { scrapedAt: "desc" } },
    }),
    getCancellationReasonBreakdown(storeId),
    getCancellationReasonTrend(storeId),
  ]);

  const points = rows.map((row) => ({
    scrapedAt: row.snapshot.scrapedAt.toISOString(),
    cancellationsPct: toNumber(row.cancellationsPct),
    cancellationsCount: toNumber(row.cancellationsCount),
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

  return { points, trend, reasonBreakdown, reasonTrend };
}

export async function getRejectionsView(
  filters: KpiFilters,
): Promise<RejectionsView> {
  const [rows, trend, lostSalesByReason] = await Promise.all([
    getRejectionsLatestByStore(filters),
    getRejectionsTrend(filters),
    getLostSalesByReason(filters),
  ]);

  return { rows, trend, lostSalesByReason };
}

// --- Period-based reads (Foody foody_rejections_by_period view) ---

/** Raw shape of a rejections period row. */
type RejectionPeriodRawRow = {
  storeId: number;
  storeName: string | null;
  periodStart: string;
  periodEnd: string;
  periodDays: number;
  scrapedAt: string | null;
  cancellationsPct: unknown;
  cancellationsCount: unknown;
  lostSales: unknown;
  reasonUnknownCount: unknown;
};

function mapRejectionPeriodRow(row: RejectionPeriodRawRow): RejectionRow {
  return {
    storeId: row.storeId,
    storeName: row.storeName,
    aggregator: "FOODY",
    scrapedAt: row.scrapedAt,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    periodDays: row.periodDays,
    cancellationsPct: toNumber(row.cancellationsPct),
    cancellationsCount: toNumber(row.cancellationsCount),
    lostSales: toNumber(row.lostSales),
    reasonUnknownCount: toNumber(row.reasonUnknownCount),
  };
}

const rejectionColumnsSql = Prisma.sql`
  "periodStart"::text  AS "periodStart",
  "periodEnd"::text    AS "periodEnd",
  period_days          AS "periodDays",
  "scrapedAt"::text    AS "scrapedAt",
  "cancellationsPct"   AS "cancellationsPct",
  "cancellationsCount" AS "cancellationsCount",
  "lostSales"          AS "lostSales",
  "reasonUnknownCount" AS "reasonUnknownCount"`;

/** Total lost sales (€) per period across the scope (a summable flow). */
async function getRejectionsPeriodTrend(
  period: PeriodKind,
  storeId: number | null,
): Promise<PeriodPoint[]> {
  const rows = await merchantScrapesPrisma.$queryRaw<
    {
      periodStart: string;
      periodEnd: string;
      periodDays: number;
      lost: unknown;
    }[]
  >(
    Prisma.sql`
      SELECT "periodStart", "periodEnd", "periodDays", lost
      FROM (
        SELECT "periodStart"::text AS "periodStart",
               "periodEnd"::text   AS "periodEnd",
               period_days         AS "periodDays",
               SUM("lostSales")    AS lost
        FROM foody_rejections_by_period
        WHERE ${periodDaysSql(period)} ${storeFilterSql(storeId)}
          AND "lostSales" IS NOT NULL
        GROUP BY "periodStart", "periodEnd", period_days
        ORDER BY "periodStart" DESC
        LIMIT ${PERIOD_TREND_LIMIT[period]}
      ) t
      ORDER BY "periodStart" ASC`,
  );

  return rows
    .map((row) => {
      const value = toNumber(row.lost);
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

/** Latest completed period's rejections per store within the scope. */
async function getRejectionsLatestPeriodRows(
  period: PeriodKind,
  storeId: number | null,
): Promise<RejectionRow[]> {
  const rows = await merchantScrapesPrisma.$queryRaw<RejectionPeriodRawRow[]>(
    Prisma.sql`
      WITH latest AS (
        SELECT MAX("periodStart") AS ps
        FROM foody_rejections_by_period
        WHERE ${periodDaysSql(period)} ${storeFilterSql(storeId)}
      )
      SELECT v."storeId" AS "storeId", v.name AS "storeName", ${rejectionColumnsSql}
      FROM foody_rejections_by_period v
      JOIN latest ON v."periodStart" = latest.ps
      WHERE ${periodDaysSql(period)} ${storeFilterSql(storeId)}
      ORDER BY v.name ASC`,
  );

  return rows.map(mapRejectionPeriodRow);
}

/** Full rejections period history for one store, newest first. */
async function getRejectionsPeriodHistory(
  period: PeriodKind,
  storeId: number,
): Promise<RejectionRow[]> {
  const rows = await merchantScrapesPrisma.$queryRaw<RejectionPeriodRawRow[]>(
    Prisma.sql`
      SELECT "storeId" AS "storeId", name AS "storeName", ${rejectionColumnsSql}
      FROM foody_rejections_by_period
      WHERE ${periodDaysSql(period)} AND "storeId" = ${storeId}
      ORDER BY "periodStart" DESC
      LIMIT ${PERIOD_TREND_LIMIT[period]}`,
  );

  return rows.map(mapRejectionPeriodRow);
}

/**
 * Cross-store lost sales grouped by reason for the latest completed period,
 * joining `CancellationReason` on the view's `rejections_snapshot_id`.
 */
async function getRejectionsLostSalesByReasonPeriod(
  period: PeriodKind,
  storeId: number | null,
): Promise<LostSalesByReasonRow[]> {
  const rows = await merchantScrapesPrisma.$queryRaw<
    { reason: string; salesLoss: unknown; storeCount: unknown }[]
  >(
    Prisma.sql`
      WITH latest AS (
        SELECT MAX("periodStart") AS ps
        FROM foody_rejections_by_period
        WHERE ${periodDaysSql(period)} ${storeFilterSql(storeId)}
      )
      SELECT cr.reason                      AS reason,
             SUM(cr."salesLoss")            AS "salesLoss",
             COUNT(DISTINCT v."storeId")    AS "storeCount"
      FROM foody_rejections_by_period v
      JOIN latest ON v."periodStart" = latest.ps
      JOIN "CancellationReason" cr
        ON cr."orderRejectionsSnapshotId" = v.rejections_snapshot_id
      WHERE ${periodDaysSql(period)} ${storeFilterSql(storeId)}
        AND cr."salesLoss" IS NOT NULL AND cr."salesLoss" > 0
      GROUP BY cr.reason
      ORDER BY "salesLoss" DESC`,
  );

  return rows
    .map((row) => ({
      reason: row.reason,
      salesLoss: toNumber(row.salesLoss) ?? 0,
      storeCount: toNumber(row.storeCount) ?? 0,
    }))
    .filter((row) => row.salesLoss > 0);
}

/** Rejections period view: latest-period rows + lost-sales trend + reasons. */
export async function getRejectionsPeriodView(
  filters: PeriodFilters,
): Promise<RejectionsPeriodView> {
  const [rows, trend, lostSalesByReason] = await Promise.all([
    getRejectionsLatestPeriodRows(filters.period, filters.storeId),
    getRejectionsPeriodTrend(filters.period, filters.storeId),
    getRejectionsLostSalesByReasonPeriod(filters.period, filters.storeId),
  ]);

  return { period: filters.period, rows, trend, lostSalesByReason };
}

/** Per-store rejections period history, a trend from it, and reason breakdown. */
export async function getRejectionsPeriodStoreView(
  storeId: number,
  period: PeriodKind,
): Promise<RejectionsPeriodStoreView> {
  const [rows, trend, reasonBreakdown, reasonTrend] = await Promise.all([
    getRejectionsPeriodHistory(period, storeId),
    getRejectionsPeriodTrend(period, storeId),
    getCancellationReasonBreakdown(storeId),
    getCancellationReasonTrend(storeId),
  ]);

  return { period, rows, trend, reasonBreakdown, reasonTrend };
}
