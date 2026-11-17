import { clickhouse } from "$lib/server/clickhouse";
import { toNumber } from "$lib/services/forecasts/forecast-series.server";
import { detailsTable } from "./sales-explore.server";
import { rangeFilter } from "./sales-offers.server";
import type { OfferDateRange } from "./sales-offers";
import type { ItemAnalysisRow } from "./sales-item-analysis";

/** `grouping(category, code)` bitmask → row level. */
const LEVELS = { 0: "item", 1: "category", 3: "grand" } as const;

/**
 * POS-style item analysis rows of one brand: every item, every category total
 * and the grand total in one round trip (GROUPING SETS), so the totals' Trans
 * are distinct orders, not sums. Matches the POS "Item Analysis Report":
 * - Qty counts top-level lines only (combo headers -1 / standalone -999 at
 *   sub-line 0); combo children and modifiers are not items.
 * - Net of every line is booked to its `trde_combo_item` (the combo head or
 *   the parent of a sub-line): the warehouse puts combo money on child lines,
 *   the POS books it on the offer. Verified on phcy 2026-11-09..12 (shares
 *   within ~1 pp of the POS export).
 * - Delivery charges (INTERNAL USE) and voided lines are left out.
 */
export async function getItemAnalysisRows(
  brand: string,
  range: OfferDateRange,
  channels?: string[],
  locations?: number[],
): Promise<ItemAnalysisRow[]> {
  const where = rangeFilter(range, channels, locations);
  const result = await clickhouse.query({
    query: `
        SELECT grouping(category, code) AS level, category, code,
          any(name) AS name, sum(qty) AS qty,
          uniqExact(order_key) AS trans, sum(net) AS net
        FROM (
          SELECT (trde_date, trde_location, trde_division, trde_no) AS order_key,
            if(trde_combo_item = '', trde_item, trde_combo_item) AS code,
            anyIf(item_category, trde_item = code) AS category,
            anyIf(item_name, trde_item = code) AS name,
            sumIf(toFloat64(trde_qty), trde_item = code AND trde_sub_line = 0
              AND trde_combo_item_pos < 0) AS qty,
            sum(toFloat64(trde_net_value)) AS net
          FROM ${detailsTable()}
          WHERE lower(brand) = {brand:String} AND trde_void_time = ''
            AND trde_item != '-1' AND item_category != 'INTERNAL USE'
            ${where.sql}
          GROUP BY order_key, code
        )
        GROUP BY GROUPING SETS ((category, code), (category), ())
      `,
    query_params: { brand, ...where.params },
    format: "JSONEachRow",
  });
  const rows = await result.json<Record<string, string | number>>();
  return rows.map((row) => ({
    level: LEVELS[toNumber(row.level) as keyof typeof LEVELS],
    // A line whose head was voided has no category of its own.
    category: String(row.category ?? "") || "Uncategorised",
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    qty: toNumber(row.qty),
    trans: toNumber(row.trans),
    net: toNumber(row.net),
  }));
}
