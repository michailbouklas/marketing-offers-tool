import { clickhouse } from "$lib/server/clickhouse";
import { prisma } from "$lib/server/prisma";
import {
  getBrandPricingTargetByAlias,
  listBrands,
} from "$lib/services/brands.server";
import { toNumber } from "$lib/services/forecasts/forecast-series.server";
import {
  detailsTable,
  EXPLORE_OFFER_CATEGORIES,
  OFFER_LINE_SQL,
} from "./sales-explore.server";
import {
  valueOffer,
  type OfferDailyRow,
  type OfferDateRange,
  type OfferValue,
  type OfferValueRow,
} from "./sales-offers";

/** The offer a line belongs to: its combo head, or itself when unlinked. */
const CODE_SQL = "if(trde_combo_item = '', trde_item, trde_combo_item)";

/** SQL + params limiting `trde_date` to a range; empty for all time. */
function rangeFilter(range: OfferDateRange | null) {
  return range
    ? {
        sql: "AND trde_date BETWEEN {from:Date} AND {to:Date}",
        params: { from: range.from, to: range.to },
      }
    : { sql: "", params: {} };
}

/**
 * POS aggregates of every offer of one brand (header codes from the offer POS
 * categories plus the brand's dim_offers codes), most recently sold first.
 * All time scans the brand's whole history (~5–8 s), hence the Postgres cache;
 * a date range limits every line, including the add-on basket.
 */
async function queryOfferRows(
  brand: string,
  range: OfferDateRange | null = null,
): Promise<OfferValueRow[]> {
  const details = detailsTable();
  const dates = rangeFilter(range);
  const result = await clickhouse.query({
    query: `
        WITH codes AS (
          SELECT DISTINCT trde_item FROM ${details}
          WHERE lower(brand) = {brand:String} AND trde_item != '-1'
            AND ${OFFER_LINE_SQL}
          UNION DISTINCT
          SELECT item_code FROM dim_offers WHERE lower(brand) = {brand:String}
        )
        SELECT
          l.code AS code,
          coalesce(d.product_desc, l.pos_name) AS name,
          d.channel AS channel,
          d.category AS category,
          d.fc_perc AS fcPerc,
          d.fc_eur AS fcEur,
          d.selling_price AS sellingPrice,
          toString(l.first_day) AS firstSale,
          toString(l.last_day) AS lastSale,
          l.days AS daysOnSale,
          l.units AS units,
          l.orders AS orders,
          l.offer_net AS offerNet,
          coalesce(b.addon, 0) AS addonNet
        FROM (
          SELECT ${CODE_SQL} AS code,
            argMax(item_name, trde_date) AS pos_name,
            min(trde_date) AS first_day,
            max(trde_date) AS last_day,
            uniqExact(trde_date) AS days,
            sumIf(toFloat64(trde_qty), trde_item = code) AS units,
            uniqExactIf((trde_date, trde_location, trde_division, trde_no),
              trde_item = code) AS orders,
            sum(toFloat64(trde_net_value)) AS offer_net
          FROM ${details}
          WHERE lower(brand) = {brand:String} AND trde_void_time = ''
            AND trde_item != '-1' AND code IN codes
            ${dates.sql}
          GROUP BY code
        ) AS l
        LEFT JOIN (
          SELECT offer AS code, sum(addon / length(offers)) AS addon
          FROM (
            SELECT
              groupUniqArrayIf(${CODE_SQL}, ${CODE_SQL} IN codes) AS offers,
              -- Delivery charges (INTDELCHARGE) are lines but not sales.
              sumIf(toFloat64(trde_net_value),
                ${CODE_SQL} NOT IN codes AND item_category != 'INTERNAL USE') AS addon
            FROM ${details}
            WHERE lower(brand) = {brand:String} AND trde_void_time = ''
              AND trde_item != '-1'
              ${dates.sql}
            GROUP BY trde_date, trde_location, trde_division, trde_no
            HAVING notEmpty(offers)
          )
          ARRAY JOIN offers AS offer
          GROUP BY offer
        ) AS b ON b.code = l.code
        LEFT JOIN (
          SELECT item_code,
            any(product_desc) AS product_desc,
            any(channel) AS channel,
            any(category) AS category,
            any(toFloat64(fc_perc)) AS fc_perc,
            any(toFloat64(fc_eur)) AS fc_eur,
            any(toFloat64(selling_price)) AS selling_price
          FROM dim_offers
          WHERE coalesce(lower(brand), {brand:String}) = {brand:String}
          GROUP BY item_code
        ) AS d ON d.item_code = l.code
        ORDER BY l.last_day DESC, l.offer_net DESC
        SETTINGS join_use_nulls = 1
      `,
    query_params: {
      brand,
      offerCats: EXPLORE_OFFER_CATEGORIES,
      ...dates.params,
    },
    format: "JSONEachRow",
  });

  const rows =
    await result.json<Record<keyof OfferValueRow, string | number | null>>();
  const nullable = (value: string | number | null) =>
    value === null ? null : toNumber(value);

  return rows.map((row) => ({
    code: String(row.code),
    name: String(row.name ?? row.code),
    channel: row.channel === null ? null : String(row.channel),
    category: row.category === null ? null : String(row.category),
    fcPerc: nullable(row.fcPerc),
    fcEur: nullable(row.fcEur),
    sellingPrice: nullable(row.sellingPrice),
    firstSale: String(row.firstSale),
    lastSale: String(row.lastSale),
    daysOnSale: toNumber(row.daysOnSale),
    units: toNumber(row.units),
    orders: toNumber(row.orders),
    offerNet: toNumber(row.offerNet),
    addonNet: toNumber(row.addonNet),
  }));
}

/**
 * Daily POS totals of a few offers of one brand for Offer VS. Same line rules
 * as `queryOfferRows`, so the days add up to the cached lifetime totals.
 */
export async function getOfferDailyRows(
  brand: string,
  codes: string[],
  range: OfferDateRange | null = null,
): Promise<OfferDailyRow[]> {
  const dates = rangeFilter(range);
  const result = await clickhouse.query({
    query: `
        SELECT ${CODE_SQL} AS code,
          toString(trde_date) AS day,
          sumIf(toFloat64(trde_qty), trde_item = code) AS units,
          uniqExactIf((trde_location, trde_division, trde_no),
            trde_item = code) AS orders,
          sum(toFloat64(trde_net_value)) AS net
        FROM ${detailsTable()}
        WHERE lower(brand) = {brand:String} AND trde_void_time = ''
          AND trde_item != '-1' AND code IN {codes:Array(String)}
          ${dates.sql}
        GROUP BY code, trde_date
        ORDER BY trde_date
      `,
    query_params: { brand, codes, ...dates.params },
    format: "JSONEachRow",
  });
  const rows =
    await result.json<Record<keyof OfferDailyRow, string | number>>();
  return rows.map((row) => ({
    code: String(row.code),
    day: String(row.day),
    units: toNumber(row.units),
    orders: toNumber(row.orders),
    net: toNumber(row.net),
  }));
}

/** Brands being rebuilt in this process (single app instance, like the crons). */
const refreshing = new Set<string>();

export type OfferRefreshResult =
  | { status: "ran"; offers: number }
  | { status: "skipped"; reason: string };

/** Recompute one brand from ClickHouse into the cache; one run per brand at a time. */
export async function refreshOfferValues(
  brand: string,
): Promise<OfferRefreshResult> {
  if (refreshing.has(brand)) {
    return { status: "skipped", reason: "a refresh is already running" };
  }
  refreshing.add(brand);

  try {
    const rows = await queryOfferRows(brand);
    const computedAt = new Date();
    await prisma.sales_offer_value_cache.upsert({
      where: { brandAlias: brand },
      create: { brandAlias: brand, rows, computedAt },
      update: { rows, computedAt },
    });
    return { status: "ran", offers: rows.length };
  } finally {
    refreshing.delete(brand);
  }
}

export type CachedOfferValues = {
  offers: OfferValue[];
  computedAt: Date;
  /** Brand ideal FC % (fraction) the verdicts were measured against. */
  idealFcPerc: number | null;
};

/**
 * Cached offers with verdicts applied now, so a changed brand FC target shows
 * without a rebuild. Null when the brand was never computed.
 */
export async function getCachedOfferValues(
  brand: string,
): Promise<CachedOfferValues | null> {
  const [cached, target] = await Promise.all([
    prisma.sales_offer_value_cache.findUnique({
      where: { brandAlias: brand },
    }),
    getBrandPricingTargetByAlias(brand),
  ]);

  if (!cached) return null;

  return {
    offers: (cached.rows as OfferValueRow[]).map((row) =>
      valueOffer(row, target?.ideal_fc_perc ?? null),
    ),
    computedAt: cached.computedAt,
    idealFcPerc: target?.ideal_fc_perc ?? null,
  };
}

/** Offers measured inside a date range, live from ClickHouse (not cached). */
export async function getOfferValuesForRange(
  brand: string,
  range: OfferDateRange,
): Promise<CachedOfferValues> {
  const [rows, target] = await Promise.all([
    queryOfferRows(brand, range),
    getBrandPricingTargetByAlias(brand),
  ]);
  const idealFcPerc = target?.ideal_fc_perc ?? null;
  return {
    offers: rows.map((row) => valueOffer(row, idealFcPerc)),
    computedAt: new Date(),
    idealFcPerc,
  };
}

/** Daily cron: rebuild every active brand one after another; failures are per brand. */
export async function refreshAllOfferValues(): Promise<{
  ran: number;
  skipped: number;
  failed: string[];
}> {
  const brands = await listBrands({ active: true });
  const summary = { ran: 0, skipped: 0, failed: [] as string[] };

  for (const brand of brands) {
    const alias = brand.alias.trim().toLowerCase();
    if (!alias) continue;
    try {
      const result = await refreshOfferValues(alias);
      summary[result.status === "ran" ? "ran" : "skipped"] += 1;
    } catch (error) {
      console.error(`[sales-offers] cache rebuild failed for ${alias}:`, error);
      summary.failed.push(alias);
    }
  }

  return summary;
}
