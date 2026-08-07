import { merchantScrapesPrisma } from "$lib/server/merchant-scrapes-prisma";
import { Prisma } from "../../../generated/merchant-scrapes-prisma/client";
import type {
  BrandScopeFilters,
  PeriodFilters,
  PeriodKind,
  PeriodPoint,
  ProGrowthPeriodStoreView,
  ProGrowthPeriodView,
  ProGrowthRow,
} from "$lib/services/aggregator-kpis/aggregator-kpis";
import { toNumber } from "$lib/services/aggregator-kpis/kpi-shared.server";
import {
  PERIOD_TREND_LIMIT,
  allStoresFilters,
  periodDaysSql,
  periodScopeSql,
  singleStoreFilters,
} from "$lib/services/aggregator-kpis/period-shared.server";

// --- Period-based reads (Foody foody_pro_growth_by_period view) ---
//
// The base table `"ProGrowthSnapshot"` is NOT modelled in
// `prisma/merchant-scrapes/schema.prisma` (that schema is a read-only mirror the
// scraper repo owns), so every read here goes through the view via `$queryRaw`.
// Two independent blocks per row — Pro subscription and new-vs-returning — each
// with its own denominator; shares are always recomputed from sums (rule 2).

/** Raw shape of a pro-growth period row. */
type ProGrowthPeriodRawRow = {
  storeId: number;
  storeName: string | null;
  periodStart: string;
  periodEnd: string;
  periodDays: number;
  scrapedAt: string | null;
  proBoxFound: boolean | null;
  proOrders: unknown;
  nonProOrders: unknown;
  newVsReturningFound: boolean | null;
  newCustomerOrders: unknown;
  returningCustomerOrders: unknown;
};

function mapProGrowthPeriodRow(row: ProGrowthPeriodRawRow): ProGrowthRow {
  return {
    storeId: row.storeId,
    storeName: row.storeName,
    aggregator: "FOODY",
    scrapedAt: row.scrapedAt,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    periodDays: row.periodDays,
    proBoxFound: row.proBoxFound,
    proOrders: toNumber(row.proOrders),
    nonProOrders: toNumber(row.nonProOrders),
    newVsReturningFound: row.newVsReturningFound,
    newCustomerOrders: toNumber(row.newCustomerOrders),
    returningCustomerOrders: toNumber(row.returningCustomerOrders),
  };
}

const proGrowthColumnsSql = Prisma.sql`
  "periodStart"::text          AS "periodStart",
  "periodEnd"::text            AS "periodEnd",
  period_days                  AS "periodDays",
  "scrapedAt"::text            AS "scrapedAt",
  "proBoxFound"                AS "proBoxFound",
  "proOrders"                  AS "proOrders",
  "nonProOrders"               AS "nonProOrders",
  "newVsReturningFound"        AS "newVsReturningFound",
  "newCustomerOrders"          AS "newCustomerOrders",
  "returningCustomerOrders"    AS "returningCustomerOrders"`;

/** Latest completed period's pro-growth per store within the scope. */
async function getProGrowthLatestPeriodRows(
  filters: PeriodFilters,
): Promise<ProGrowthRow[]> {
  const rows = await merchantScrapesPrisma.$queryRaw<ProGrowthPeriodRawRow[]>(
    Prisma.sql`
      WITH latest AS (
        SELECT MAX("periodStart") AS ps
        FROM foody_pro_growth_by_period
        WHERE ${periodDaysSql(filters.period)} ${periodScopeSql(filters)}
      )
      SELECT v."storeId" AS "storeId", v.name AS "storeName", ${proGrowthColumnsSql}
      FROM foody_pro_growth_by_period v
      JOIN latest ON v."periodStart" = latest.ps
      WHERE ${periodDaysSql(filters.period)} ${periodScopeSql(filters)}
      ORDER BY v.name ASC`,
  );

  return rows.map(mapProGrowthPeriodRow);
}

/** Full pro-growth period history for one store, newest first. */
async function getProGrowthPeriodHistory(
  period: PeriodKind,
  storeId: number,
): Promise<ProGrowthRow[]> {
  const rows = await merchantScrapesPrisma.$queryRaw<ProGrowthPeriodRawRow[]>(
    Prisma.sql`
      SELECT "storeId" AS "storeId", name AS "storeName", ${proGrowthColumnsSql}
      FROM foody_pro_growth_by_period
      WHERE ${periodDaysSql(period)} AND "storeId" = ${storeId}
      ORDER BY "periodStart" DESC
      LIMIT ${PERIOD_TREND_LIMIT[period]}`,
  );

  return rows.map(mapProGrowthPeriodRow);
}

type ShareTrendRawRow = {
  periodStart: string;
  periodEnd: string;
  periodDays: number;
  pct: unknown;
};

function mapShareTrend(rows: ShareTrendRawRow[]): PeriodPoint[] {
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

/**
 * Per-period Pro order share (%) across the scope (rule 2): recompute from
 * summed numerator/denominator, never average per-store shares.
 */
async function getProShareTrend(
  filters: PeriodFilters,
): Promise<PeriodPoint[]> {
  const rows = await merchantScrapesPrisma.$queryRaw<ShareTrendRawRow[]>(
    Prisma.sql`
      SELECT "periodStart", "periodEnd", "periodDays", pct
      FROM (
        SELECT "periodStart"::text AS "periodStart",
               "periodEnd"::text   AS "periodEnd",
               period_days         AS "periodDays",
               100 * SUM("proOrders")
                   / NULLIF(SUM("proOrders" + "nonProOrders"), 0) AS pct
        FROM foody_pro_growth_by_period
        WHERE ${periodDaysSql(filters.period)} ${periodScopeSql(filters)}
          AND "proOrders" IS NOT NULL AND "nonProOrders" IS NOT NULL
        GROUP BY "periodStart", "periodEnd", period_days
        ORDER BY "periodStart" DESC
        LIMIT ${PERIOD_TREND_LIMIT[filters.period]}
      ) t
      ORDER BY "periodStart" ASC`,
  );

  return mapShareTrend(rows);
}

/**
 * Per-period new-customer order share (%) across the scope (rule 2). Its own
 * denominator — independent of the Pro block and of metrics orders.
 */
async function getNewShareTrend(
  filters: PeriodFilters,
): Promise<PeriodPoint[]> {
  const rows = await merchantScrapesPrisma.$queryRaw<ShareTrendRawRow[]>(
    Prisma.sql`
      SELECT "periodStart", "periodEnd", "periodDays", pct
      FROM (
        SELECT "periodStart"::text AS "periodStart",
               "periodEnd"::text   AS "periodEnd",
               period_days         AS "periodDays",
               100 * SUM("newCustomerOrders")
                   / NULLIF(SUM("newCustomerOrders" + "returningCustomerOrders"), 0) AS pct
        FROM foody_pro_growth_by_period
        WHERE ${periodDaysSql(filters.period)} ${periodScopeSql(filters)}
          AND "newCustomerOrders" IS NOT NULL
          AND "returningCustomerOrders" IS NOT NULL
        GROUP BY "periodStart", "periodEnd", period_days
        ORDER BY "periodStart" DESC
        LIMIT ${PERIOD_TREND_LIMIT[filters.period]}
      ) t
      ORDER BY "periodStart" ASC`,
  );

  return mapShareTrend(rows);
}

/** Pro growth period view: latest-period rows + both share trends. */
export async function getProGrowthPeriodView(
  filters: PeriodFilters,
): Promise<ProGrowthPeriodView> {
  const [rows, proShareTrend, newShareTrend] = await Promise.all([
    getProGrowthLatestPeriodRows(filters),
    getProShareTrend(filters),
    getNewShareTrend(filters),
  ]);

  return { period: filters.period, rows, proShareTrend, newShareTrend };
}

/** Per-store pro growth period history + share trends derived from it. */
export async function getProGrowthPeriodStoreView(
  storeId: number,
  period: PeriodKind,
): Promise<ProGrowthPeriodStoreView> {
  const scope = singleStoreFilters(storeId, period);

  const [rows, proShareTrend, newShareTrend] = await Promise.all([
    getProGrowthPeriodHistory(period, storeId),
    getProShareTrend(scope),
    getNewShareTrend(scope),
  ]);

  return { period, rows, proShareTrend, newShareTrend };
}

/**
 * Latest completed week's pro-growth rows across all stores — used by the
 * landing dashboard to compute the company-wide Pro order share. View-based (no
 * `ProGrowthSnapshot` model dependency).
 */
export async function getProGrowthLatestRows(
  scope: BrandScopeFilters,
): Promise<ProGrowthRow[]> {
  return getProGrowthLatestPeriodRows({
    ...allStoresFilters("week"),
    ...scope,
  });
}
