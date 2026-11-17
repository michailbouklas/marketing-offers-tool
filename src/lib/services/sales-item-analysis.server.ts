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
 * are distinct orders, not sums. Matches the POS "Item Analysis Report"
 * (phcy 2026-11-01..08 export: same 1,065 items; trans exact on 1,062, net
 * within 5c on 1,062, qty exact on 1,041; totals 25,342 vs 25,340 trans,
 * +0.006% net):
 * - Only orders with a `transactions` header (rangeFilter): lines without
 *   one (~7% of phcy order keys) are not sales the POS reports.
 * - Qty = trde_qty × trde_qty_ratio of the item's own sub-line-0 lines, so a
 *   half pizza counts 0.5; combo children point at their head, not themselves.
 * - Lines with trde_qty_ratio > 1 are Half & Half containers (phcy only,
 *   always the two halves' parent), which the POS does not list: left out.
 * - Net of every line is booked to its `trde_combo_item` (the combo head or
 *   the parent of a sub-line): the warehouse puts combo money on child lines,
 *   the POS books it on the offer.
 * - Delivery charges (INTERNAL USE) and voided lines are left out.
 * shortcut: meal / pair-offer qty (~20 codes, e.g. Value Meals) still differs
 * from the POS, whose combo quantity rule is not derivable from these
 * columns; revisit if the POS team can define it.
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
            sumIf(toFloat64(trde_qty * trde_qty_ratio),
              trde_item = code AND trde_sub_line = 0) AS qty,
            sum(toFloat64(trde_net_value)) AS net
          FROM ${detailsTable()}
          WHERE lower(brand) = {brand:String} AND trde_void_time = ''
            AND trde_item != '-1' AND item_category != 'INTERNAL USE'
            AND trde_qty_ratio <= 1
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
