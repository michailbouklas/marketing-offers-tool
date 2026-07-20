import { merchantScrapesPrisma } from "$lib/server/merchant-scrapes-prisma";
import { Prisma } from "../../../generated/merchant-scrapes-prisma/client";
import type {
  AggregatorValue,
  ClosureReasonBreakdown,
  ClosureRow,
  ClosuresPeriodStoreView,
  ClosuresPeriodView,
  ClosuresStoreView,
  ClosuresView,
  KpiFilters,
  PeriodFilters,
  PeriodKind,
  PeriodPoint,
  TimeseriesPoint,
  WoltClosureDay,
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
            select: {
              offlineOpenHoursPct: true,
              unreachableSeconds: true,
              offlineDurationSeconds: true,
              offlineDurationRaw: true,
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
      const closures = snapshot?.closures;

      return {
        storeId: store.id,
        storeName: store.name,
        aggregator: store.aggregator as AggregatorValue,
        scrapedAt: snapshot ? snapshot.scrapedAt.toISOString() : null,
        offlineOpenHoursPct: toNumber(closures?.offlineOpenHoursPct),
        unreachableSeconds: toNumber(closures?.unreachableSeconds),
        offlineDurationSeconds: toNumber(closures?.offlineDurationSeconds),
        offlineDurationRaw: closures?.offlineDurationRaw ?? null,
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
 * Latest-snapshot offline reason breakdown for one store. Uses the latest
 * closures snapshot that exists (rows are written only for ok/partial sections,
 * so `findFirst` here is inherently "latest where the child exists"). Headline
 * offline duration comes from the snapshot columns, the per-reason durations
 * from the child rows (sorted by duration desc). Returns null when the store has
 * no closures snapshot at all.
 */
export async function getClosureReasonBreakdown(
  storeId: number,
): Promise<ClosureReasonBreakdown | null> {
  const snapshot = await merchantScrapesPrisma.closuresSnapshot.findFirst({
    where: { snapshot: { store: { id: storeId } } },
    orderBy: { snapshot: { scrapedAt: "desc" } },
    select: {
      offlineDurationSeconds: true,
      offlineDurationRaw: true,
      snapshot: { select: { scrapedAt: true } },
      reasons: {
        select: { reason: true, durationSeconds: true, durationRaw: true },
      },
    },
  });

  if (!snapshot) {
    return null;
  }

  const reasons = snapshot.reasons
    .map((row) => ({
      reason: row.reason,
      durationSeconds: toNumber(row.durationSeconds),
      durationRaw: row.durationRaw ?? null,
    }))
    .sort((a, b) => (b.durationSeconds ?? 0) - (a.durationSeconds ?? 0));

  return {
    scrapedAt: snapshot.snapshot.scrapedAt.toISOString(),
    offlineDurationSeconds: toNumber(snapshot.offlineDurationSeconds),
    offlineDurationRaw: snapshot.offlineDurationRaw ?? null,
    reasons,
  };
}

/**
 * Full closures history for one store (every captured snapshot, newest first),
 * a daily-average offline-open-hours trend derived from that same history, and
 * the latest-snapshot offline reason breakdown. Querying `closuresSnapshot`
 * directly means only snapshots that actually have closures data are returned —
 * a missing snapshot is "no data", never a real 0.
 */
export async function getClosuresStoreView(
  storeId: number,
): Promise<ClosuresStoreView> {
  const [rows, reasonBreakdown] = await Promise.all([
    merchantScrapesPrisma.closuresSnapshot.findMany({
      where: { snapshot: { store: { id: storeId } } },
      select: {
        offlineOpenHoursPct: true,
        unreachableSeconds: true,
        offlineDurationSeconds: true,
        offlineDurationRaw: true,
        snapshot: { select: { scrapedAt: true, runId: true } },
      },
      orderBy: { snapshot: { scrapedAt: "desc" } },
    }),
    getClosureReasonBreakdown(storeId),
  ]);

  const points = rows.map((row) => ({
    scrapedAt: row.snapshot.scrapedAt.toISOString(),
    offlineOpenHoursPct: toNumber(row.offlineOpenHoursPct),
    unreachableSeconds: toNumber(row.unreachableSeconds),
    offlineDurationSeconds: toNumber(row.offlineDurationSeconds),
    offlineDurationRaw: row.offlineDurationRaw ?? null,
    runId: row.snapshot.runId,
  }));

  const trend = averageByDay(
    rows.map((row) => ({
      scrapedAt: row.snapshot.scrapedAt,
      value: toNumber(row.offlineOpenHoursPct),
    })),
  );

  return { points, trend, reasonBreakdown };
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

// --- Period-based reads (Foody foody_closures_by_period view) ---

/** Raw shape of a closures period row (dates/timestamps cast to text in SQL). */
type ClosurePeriodRawRow = {
  storeId: number;
  storeName: string | null;
  periodStart: string;
  periodEnd: string;
  periodDays: number;
  scrapedAt: string | null;
  offlineOpenHoursPct: unknown;
  offlineDurationSeconds: unknown;
  offlineDurationRaw: string | null;
  unreachableSeconds: unknown;
};

function mapClosurePeriodRow(row: ClosurePeriodRawRow): ClosureRow {
  return {
    storeId: row.storeId,
    storeName: row.storeName,
    aggregator: "FOODY",
    scrapedAt: row.scrapedAt,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    periodDays: row.periodDays,
    offlineOpenHoursPct: toNumber(row.offlineOpenHoursPct),
    unreachableSeconds: toNumber(row.unreachableSeconds),
    offlineDurationSeconds: toNumber(row.offlineDurationSeconds),
    offlineDurationRaw: row.offlineDurationRaw ?? null,
  };
}

/** Total offline hours per period across the scope (a summable flow). */
async function getClosuresPeriodTrend(
  period: PeriodKind,
  storeId: number | null,
): Promise<PeriodPoint[]> {
  const rows = await merchantScrapesPrisma.$queryRaw<
    {
      periodStart: string;
      periodEnd: string;
      periodDays: number;
      hours: unknown;
    }[]
  >(
    Prisma.sql`
      SELECT "periodStart", "periodEnd", "periodDays", hours
      FROM (
        SELECT "periodStart"::text AS "periodStart",
               "periodEnd"::text   AS "periodEnd",
               period_days         AS "periodDays",
               SUM("offlineDurationSeconds")::float8 / 3600.0 AS hours
        FROM foody_closures_by_period
        WHERE ${periodDaysSql(period)} ${storeFilterSql(storeId)}
          AND "offlineDurationSeconds" IS NOT NULL
        GROUP BY "periodStart", "periodEnd", period_days
        ORDER BY "periodStart" DESC
        LIMIT ${PERIOD_TREND_LIMIT[period]}
      ) t
      ORDER BY "periodStart" ASC`,
  );

  return rows
    .map((row) => {
      const value = toNumber(row.hours);
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

/** Latest completed period's closures per store within the scope. */
async function getClosuresLatestPeriodRows(
  period: PeriodKind,
  storeId: number | null,
): Promise<ClosureRow[]> {
  const rows = await merchantScrapesPrisma.$queryRaw<ClosurePeriodRawRow[]>(
    Prisma.sql`
      WITH latest AS (
        SELECT MAX("periodStart") AS ps
        FROM foody_closures_by_period
        WHERE ${periodDaysSql(period)} ${storeFilterSql(storeId)}
      )
      SELECT v."storeId"                 AS "storeId",
             v.name                      AS "storeName",
             v."periodStart"::text       AS "periodStart",
             v."periodEnd"::text         AS "periodEnd",
             v.period_days               AS "periodDays",
             v."scrapedAt"::text         AS "scrapedAt",
             v."offlineOpenHoursPct"     AS "offlineOpenHoursPct",
             v."offlineDurationSeconds"  AS "offlineDurationSeconds",
             v."offlineDurationRaw"      AS "offlineDurationRaw",
             v."unreachableSeconds"      AS "unreachableSeconds"
      FROM foody_closures_by_period v
      JOIN latest ON v."periodStart" = latest.ps
      WHERE ${periodDaysSql(period)} ${storeFilterSql(storeId)}
      ORDER BY v.name ASC`,
  );

  return rows.map(mapClosurePeriodRow);
}

/** Full closures period history for one store, newest first. */
async function getClosuresPeriodHistory(
  period: PeriodKind,
  storeId: number,
): Promise<ClosureRow[]> {
  const rows = await merchantScrapesPrisma.$queryRaw<ClosurePeriodRawRow[]>(
    Prisma.sql`
      SELECT "storeId"                 AS "storeId",
             name                      AS "storeName",
             "periodStart"::text       AS "periodStart",
             "periodEnd"::text         AS "periodEnd",
             period_days               AS "periodDays",
             "scrapedAt"::text         AS "scrapedAt",
             "offlineOpenHoursPct"     AS "offlineOpenHoursPct",
             "offlineDurationSeconds"  AS "offlineDurationSeconds",
             "offlineDurationRaw"      AS "offlineDurationRaw",
             "unreachableSeconds"      AS "unreachableSeconds"
      FROM foody_closures_by_period
      WHERE ${periodDaysSql(period)} AND "storeId" = ${storeId}
      ORDER BY "periodStart" DESC
      LIMIT ${PERIOD_TREND_LIMIT[period]}`,
  );

  return rows.map(mapClosurePeriodRow);
}

// --- Wolt period reads (wolt_closures_by_period + ClosureDay per-day child) ---
//
// Wolt aliases: unavailable_seconds ≙ offlineDurationSeconds, unavailable_pct ≙
// offlineOpenHoursPct. It has no unreachable metric but adds `loss_amount` (€
// lost to unavailability) and the portal delta columns. Per-day unavailability
// (app-not-live vs manual-offline) lives on the ClosureDay child table.

type WoltClosurePeriodRawRow = {
  storeId: number;
  storeName: string | null;
  periodStart: string;
  periodEnd: string;
  periodDays: number;
  scrapedAt: string | null;
  offlineOpenHoursPct: unknown;
  offlineDurationSeconds: unknown;
  offlineDurationRaw: string | null;
  lossAmount: unknown;
  offlineDurationDeltaPct: unknown;
  offlineOpenHoursPctDeltaPct: unknown;
  lossDeltaPct: unknown;
  comparisonWindow: string | null;
};

function mapWoltClosurePeriodRow(row: WoltClosurePeriodRawRow): ClosureRow {
  const window = row.comparisonWindow;
  return {
    storeId: row.storeId,
    storeName: row.storeName,
    aggregator: "WOLT",
    scrapedAt: row.scrapedAt,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    periodDays: row.periodDays,
    offlineOpenHoursPct: toNumber(row.offlineOpenHoursPct),
    unreachableSeconds: null,
    offlineDurationSeconds: toNumber(row.offlineDurationSeconds),
    offlineDurationRaw: row.offlineDurationRaw ?? null,
    lossAmount: toNumber(row.lossAmount),
    deltas: {
      offlineDuration: { pct: toNumber(row.offlineDurationDeltaPct), window },
      offlineOpenHoursPct: {
        pct: toNumber(row.offlineOpenHoursPctDeltaPct),
        window,
      },
      loss: { pct: toNumber(row.lossDeltaPct), window },
    },
  };
}

const woltClosureColumnsSql = Prisma.sql`
  "periodStart"::text              AS "periodStart",
  "periodEnd"::text                AS "periodEnd",
  period_days                      AS "periodDays",
  "scrapedAt"::text                AS "scrapedAt",
  unavailable_pct                  AS "offlineOpenHoursPct",
  unavailable_seconds              AS "offlineDurationSeconds",
  unavailable_raw                  AS "offlineDurationRaw",
  loss_amount                      AS "lossAmount",
  unavailable_delta_pct            AS "offlineDurationDeltaPct",
  unavailable_pct_delta_pct        AS "offlineOpenHoursPctDeltaPct",
  loss_delta_pct                   AS "lossDeltaPct",
  comparison_window                AS "comparisonWindow"`;

/** Total offline hours per period across the scope, from the Wolt view. */
async function getWoltClosuresPeriodTrend(
  period: PeriodKind,
  storeId: number | null,
): Promise<PeriodPoint[]> {
  const rows = await merchantScrapesPrisma.$queryRaw<
    {
      periodStart: string;
      periodEnd: string;
      periodDays: number;
      hours: unknown;
    }[]
  >(
    Prisma.sql`
      SELECT "periodStart", "periodEnd", "periodDays", hours
      FROM (
        SELECT "periodStart"::text AS "periodStart",
               "periodEnd"::text   AS "periodEnd",
               period_days         AS "periodDays",
               SUM(unavailable_seconds)::float8 / 3600.0 AS hours
        FROM wolt_closures_by_period
        WHERE ${periodDaysSql(period)} ${storeFilterSql(storeId)}
          AND unavailable_seconds IS NOT NULL
        GROUP BY "periodStart", "periodEnd", period_days
        ORDER BY "periodStart" DESC
        LIMIT ${PERIOD_TREND_LIMIT[period]}
      ) t
      ORDER BY "periodStart" ASC`,
  );

  return rows
    .map((row) => {
      const value = toNumber(row.hours);
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

/** Latest completed period's Wolt closures per store within the scope. */
async function getWoltClosuresLatestPeriodRows(
  period: PeriodKind,
  storeId: number | null,
): Promise<ClosureRow[]> {
  const rows = await merchantScrapesPrisma.$queryRaw<WoltClosurePeriodRawRow[]>(
    Prisma.sql`
      WITH latest AS (
        SELECT MAX("periodStart") AS ps
        FROM wolt_closures_by_period
        WHERE ${periodDaysSql(period)} ${storeFilterSql(storeId)}
      )
      SELECT v."storeId" AS "storeId", v.name AS "storeName", ${woltClosureColumnsSql}
      FROM wolt_closures_by_period v
      JOIN latest ON v."periodStart" = latest.ps
      WHERE ${periodDaysSql(period)} ${storeFilterSql(storeId)}
      ORDER BY v.name ASC`,
  );

  return rows.map(mapWoltClosurePeriodRow);
}

/** Full Wolt closures period history for one store, newest first. */
async function getWoltClosuresPeriodHistory(
  period: PeriodKind,
  storeId: number,
): Promise<ClosureRow[]> {
  const rows = await merchantScrapesPrisma.$queryRaw<WoltClosurePeriodRawRow[]>(
    Prisma.sql`
      SELECT "storeId" AS "storeId", name AS "storeName", ${woltClosureColumnsSql}
      FROM wolt_closures_by_period
      WHERE ${periodDaysSql(period)} AND "storeId" = ${storeId}
      ORDER BY "periodStart" DESC
      LIMIT ${PERIOD_TREND_LIMIT[period]}`,
  );

  return rows.map(mapWoltClosurePeriodRow);
}

/**
 * Per-day unavailability for the latest completed period, summed by date across
 * the scope. Every period day has a ClosureDay row, so `(0, 0)` is a real
 * zero-closure day. Returns [] when the per-day chart never rendered (§4.4).
 */
async function getWoltClosuresPerDay(
  period: PeriodKind,
  storeId: number | null,
): Promise<WoltClosureDay[]> {
  const rows = await merchantScrapesPrisma.$queryRaw<
    {
      date: string;
      appNotLiveSeconds: unknown;
      manualOfflineSeconds: unknown;
      lossAmount: unknown;
    }[]
  >(
    Prisma.sql`
      WITH latest AS (
        SELECT MAX("periodStart") AS ps
        FROM wolt_closures_by_period
        WHERE ${periodDaysSql(period)} ${storeFilterSql(storeId)}
      )
      SELECT d.date::text                       AS date,
             SUM(d."appNotLiveSeconds")         AS "appNotLiveSeconds",
             SUM(d."manualOfflineSeconds")      AS "manualOfflineSeconds",
             SUM(d."lossAmount")                AS "lossAmount"
      FROM wolt_closures_by_period v
      JOIN latest ON v."periodStart" = latest.ps
      JOIN "ClosureDay" d ON d."closuresSnapshotId" = v.closures_id
      WHERE ${periodDaysSql(period)} ${storeFilterSql(storeId)}
      GROUP BY d.date
      ORDER BY d.date ASC`,
  );

  return rows.map((row) => ({
    date: row.date,
    appNotLiveSeconds: toNumber(row.appNotLiveSeconds),
    manualOfflineSeconds: toNumber(row.manualOfflineSeconds),
    lossAmount: toNumber(row.lossAmount),
  }));
}

/** Closures period view: latest-period rows + per-period offline-hours trend. */
export async function getClosuresPeriodView(
  filters: PeriodFilters,
  aggregator: AggregatorValue = "FOODY",
): Promise<ClosuresPeriodView> {
  if (aggregator === "WOLT") {
    const [rows, trend, perDay] = await Promise.all([
      getWoltClosuresLatestPeriodRows(filters.period, filters.storeId),
      getWoltClosuresPeriodTrend(filters.period, filters.storeId),
      getWoltClosuresPerDay(filters.period, filters.storeId),
    ]);

    return { period: filters.period, rows, trend, perDay };
  }

  const [rows, trend] = await Promise.all([
    getClosuresLatestPeriodRows(filters.period, filters.storeId),
    getClosuresPeriodTrend(filters.period, filters.storeId),
  ]);

  return { period: filters.period, rows, trend };
}

/** Per-store closures period history, a trend from it, and reason breakdown. */
export async function getClosuresPeriodStoreView(
  storeId: number,
  period: PeriodKind,
  aggregator: AggregatorValue = "FOODY",
): Promise<ClosuresPeriodStoreView> {
  if (aggregator === "WOLT") {
    const [rows, trend, perDay] = await Promise.all([
      getWoltClosuresPeriodHistory(period, storeId),
      getWoltClosuresPeriodTrend(period, storeId),
      getWoltClosuresPerDay(period, storeId),
    ]);

    // Wolt has no closure-reason carousel (its breakdown is per-day).
    return { period, rows, trend, reasonBreakdown: null, perDay };
  }

  const [rows, trend, reasonBreakdown] = await Promise.all([
    getClosuresPeriodHistory(period, storeId),
    getClosuresPeriodTrend(period, storeId),
    getClosureReasonBreakdown(storeId),
  ]);

  return { period, rows, trend, reasonBreakdown };
}
