import { createWriteStream } from "node:fs";
import { error, type RequestEvent } from "@sveltejs/kit";
import type { z } from "zod";
import { requireApiPermission } from "$lib/server/auth-guards";
import { pipeline } from "node:stream/promises";
import { TupleParam } from "@clickhouse/client";
import { clickhouse } from "$lib/server/clickhouse";
import {
  salesTransactionsTable,
  toNumber,
} from "$lib/services/forecasts/forecast-series.server";
import {
  EXPLORE_COLUMNS,
  EXPLORE_EXPORT_MAX_ROWS,
  EXPLORE_OFFER_OPTIONS_LIMIT,
  EXPLORE_VALUES_LIMIT,
  ORDER_PK_PATTERN,
  VALUE_BUCKETS,
  type ExploreColumnId,
  type ExploreValueBreakdown,
  type ExploreCondition,
  type ExploreFilter,
  type ExploreOfferOption,
  type ExploreOrderOffer,
  type ExploreOrder,
  type ExploreRow,
  type ExploreSort,
  type OfferFilter,
} from "./sales-explore";
import { OFFER_ITEM_CATEGORIES } from "./offers-data-quality-clickhouse.server";
import {
  resolveSalesDashboardScope,
  type SalesDashboardScope,
} from "./sales-dashboard.server";

/**
 * Server-only ClickHouse reads for /sales/explore: one row per order from
 * `transactions`. Every query is pinned to the caller's scoped brands and the
 * URL date window; grid filters only narrow inside that. Column ids map to
 * fixed SQL below, user values only ever travel as bound parameters.
 */

const COLUMN_SQL: Record<ExploreColumnId, string> = {
  order_no: "tran_no",
  day: "tran_date",
  time: "formatDateTime(toTimeZone(trans_order_time, 'Europe/Athens'), '%H:%i')",
  brand: "lower(brand)",
  store: "location_name",
  channel: "dim_division_group_channel",
  source: "dim_division_group_source",
  division_group: "dim_division_group_name",
  division: "division_name",
  online: "if(tran_online_factor = 1, 'Online', 'In-store')",
  payment: "cash_method_description",
  receipt_method: "receipt_method_description",
  type: "if(tran_sales_factor < 0, 'Return', 'Sale')",
  net: "tran_net",
  discount: "tran_discount",
};

const KIND = new Map(EXPLORE_COLUMNS.map((column) => [column.id, column.kind]));
const DEFAULT_ORDER = "tran_date DESC, trans_order_time DESC, pk";

/**
 * POS categories that mark an offer or coupon line: the /offers-data-quality
 * list plus the coupon/extra categories from the offers skill doc.
 * shortcut: hand-maintained like DQ's list; a new POS category needs a code
 * change (upgrade: drive both from one table if categories churn).
 */
export const EXPLORE_OFFER_CATEGORIES: string[] = [
  ...new Set<string>([
    ...OFFER_ITEM_CATEGORIES,
    "Coupons PH",
    "Discount Offers",
    "Coupons NER",
    "Coupons",
    "Coupons TAV",
    "King Savers",
    "Taco Bell Coupons",
    "Coupons WAG",
    "Coupons VER",
    "Coupons BK",
    "Digital Coupons BK",
    "Digital Coupons PH",
    "UoC Coupons NER",
  ]),
];

/**
 * An offer = a non-voided line in an offer category that heads its bundle
 * (self-referencing combo, pos -1, or standalone). Components that happen to
 * sit in an offer category (e.g. KFC call-centre sides) are not offers.
 * Needs `{offerCats:Array(String)}` bound.
 */
const OFFER_LINE_SQL = `item_category IN {offerCats:Array(String)}
    AND (trde_item = trde_combo_item OR trde_combo_item_pos = -1 OR trde_combo_item = '')
    AND trde_void_time = ''`;

/**
 * POS categories whose lines are meal deals / combos, from a 7-day probe of
 * `transaction_details` (2026-11-02). Category, not structure: the
 * combo-item-analysis skill's `trde_is_master_item` is 1 on every line, every
 * line self-references `trde_combo_item`, and sub-lines are mostly modifiers.
 * shortcut: hand-maintained like EXPLORE_OFFER_CATEGORIES; a new POS meal
 * category needs a code change. Fasting/Lunch menus and "Deals PAU" left out
 * as ambiguous.
 */
export const EXPLORE_COMBO_CATEGORIES: string[] = [
  "Combo Meals",
  "Kids Meals",
  "Meals JMO",
  "Kids Menu JMO",
  "Regular Buckets",
  "Duo Buckets",
  "Burger & Wrap Meals",
  "Value Box Meals",
  "Snack Meals",
  "Kids Meals KFC",
  "Chicken On The Bone Meals",
  "Kids Menu PAU",
  "Value Meals",
  "Kids Menu",
  "Kids Menu PAT",
  "Taco Bell Combos",
  "TB Big Bell Box",
  "TB Kids Meal",
  "Taco Bell Bundles",
  "Meals TAV",
  "Kids Meals TAV",
  "Kids Menu VER",
  "Mini Menu",
  "Bundles WAG",
];

/** A meal-deal line: a non-voided header line in a combo category. Needs `{comboCats:Array(String)}`. */
const COMBO_LINE_SQL = `item_category IN {comboCats:Array(String)}
    AND trde_sub_line = 0
    AND trde_void_time = ''`;

function detailsTable(): string {
  return salesTransactionsTable().replace(
    /\.transactions$/,
    ".transaction_details",
  );
}

type Params = Record<string, unknown>;

/** Bound-parameter collector: returns `{pN:Type}` placeholders. */
function paramBag(params: Params) {
  let next = 0;
  return (value: unknown, type: string) => {
    const name = `p${next++}`;
    params[name] = value;
    return `{${name}:${type}}`;
  };
}

function conditionSql(
  col: string,
  kind: string,
  condition: ExploreCondition,
  bind: ReturnType<typeof paramBag>,
): string | null {
  if (condition.operator === "blank") {
    return kind === "text" ? `${col} = ''` : "0";
  }
  if (condition.operator === "notBlank") {
    return kind === "text" ? `${col} != ''` : "1";
  }

  if (condition.type === "text") {
    if (kind !== "text") return null;
    if (condition.selectedValues) {
      const values = condition.selectedValues.filter((v) => v !== null);
      const parts = [`${col} IN ${bind(values.map(String), "Array(String)")}`];
      if (
        condition.includeBlank ||
        values.length < condition.selectedValues.length
      ) {
        parts.push(`${col} = ''`);
      }
      return `(${parts.join(" OR ")})`;
    }
    if (condition.value === undefined || condition.value === "") return null;
    const value = bind(condition.value, "String");
    switch (condition.operator) {
      case "contains":
        return `positionCaseInsensitiveUTF8(${col}, ${value}) > 0`;
      case "notContains":
        return `positionCaseInsensitiveUTF8(${col}, ${value}) = 0`;
      case "equals":
        return `lowerUTF8(${col}) = lowerUTF8(${value})`;
      case "notEquals":
        return `lowerUTF8(${col}) != lowerUTF8(${value})`;
      case "startsWith":
        return `startsWith(lowerUTF8(${col}), lowerUTF8(${value}))`;
      case "endsWith":
        return `endsWith(lowerUTF8(${col}), lowerUTF8(${value}))`;
    }
  }

  if (condition.type === "number" && kind === "number") {
    if (condition.value === undefined) return null;
    const num = `toFloat64(${col})`;
    const value = bind(condition.value, "Float64");
    if (condition.operator === "between") {
      if (condition.valueTo === undefined) return null;
      return `${num} BETWEEN ${value} AND ${bind(condition.valueTo, "Float64")}`;
    }
    return `${num} ${condition.operator} ${value}`;
  }

  if (condition.type === "date" && kind === "date") {
    if (condition.value === undefined) return null;
    const value = bind(condition.value, "Date");
    if (condition.operator === "between") {
      if (condition.valueTo === undefined) return null;
      return `${col} BETWEEN ${value} AND ${bind(condition.valueTo, "Date")}`;
    }
    return `${col} ${condition.operator} ${value}`;
  }

  // Condition type does not match the column (crafted request): ignore it.
  return null;
}

/**
 * WHERE clause = scope (date window + scoped brands, always) AND the grid's
 * column filters, honouring both and/or levels, AND the Offers Assistant
 * filter. `skip` leaves one column's own filter out (its value list must
 * still offer the other values).
 */
export function buildExploreWhere(
  scope: Pick<SalesDashboardScope["filters"], "from" | "to" | "brands">,
  filter: ExploreFilter,
  skip?: ExploreColumnId,
  offers?: OfferFilter | null,
): { sql: string; params: Params } {
  const params: Params = {
    from: scope.from,
    to: scope.to,
    brands: scope.brands,
  };
  const bind = paramBag(params);
  const clauses = [
    "tran_date BETWEEN {from:Date} AND {to:Date}",
    "lower(brand) IN {brands:Array(String)}",
  ];

  for (const [id, model] of Object.entries(filter) as [
    ExploreColumnId,
    NonNullable<ExploreFilter[ExploreColumnId]>,
  ][]) {
    if (id === skip || !(id in COLUMN_SQL)) continue;
    const groups = model.groups
      .map((group) => {
        const parts = group.conditions
          .map((c) => conditionSql(COLUMN_SQL[id], KIND.get(id)!, c, bind))
          .filter((part): part is string => part !== null);
        return parts.length
          ? `(${parts.join(group.combination === "or" ? " OR " : " AND ")})`
          : null;
      })
      .filter((part): part is string => part !== null);
    if (groups.length) {
      clauses.push(
        `(${groups.join(model.combination === "or" ? " OR " : " AND ")})`,
      );
    }
  }

  // Semi-join on the order key; both sides prune on the same date window.
  const ordersHolding = (negate: boolean, lineSql: string) =>
    `(tran_date, tran_location, tran_division, tran_no) ${negate ? "NOT IN" : "IN"} (
    SELECT trde_date, trde_location, trde_division, trde_no
    FROM ${detailsTable()}
    WHERE trde_date BETWEEN {from:Date} AND {to:Date}
      AND lower(brand) IN {brands:Array(String)}
      AND ${lineSql})`;

  if (offers?.mode) {
    params.offerCats = EXPLORE_OFFER_CATEGORIES;
    const byItem =
      offers.mode === "with" || offers.mode === "without"
        ? `\n      AND trde_item IN ${bind(offers.items, "Array(String)")}`
        : "";
    clauses.push(
      ordersHolding(
        offers.mode === "without" || offers.mode === "none",
        OFFER_LINE_SQL + byItem,
      ),
    );
  }

  if (offers?.combo) {
    params.comboCats = EXPLORE_COMBO_CATEGORIES;
    clauses.push(ordersHolding(offers.combo === "exclude", COMBO_LINE_SQL));
  }

  return { sql: clauses.join("\n  AND "), params };
}

export function buildExploreOrderBy(sort: ExploreSort): string {
  const parts = sort
    .filter((s) => s.direction && s.colId in COLUMN_SQL)
    .map(
      (s) =>
        `${COLUMN_SQL[s.colId]} ${s.direction === "desc" ? "DESC" : "ASC"}`,
    );
  // pk last keeps paging stable when sort keys tie.
  return parts.length ? `${parts.join(", ")}, pk` : DEFAULT_ORDER;
}

const SELECT_COLUMNS = EXPLORE_COLUMNS.map(
  (column) => `${COLUMN_SQL[column.id]} AS ${column.id}`,
).join(",\n  ");

function toRow(raw: Record<string, unknown>): ExploreRow {
  const row = { pk: String(raw.pk) } as ExploreRow;
  for (const column of EXPLORE_COLUMNS) {
    const value = raw[column.id];
    row[column.id] =
      column.kind === "number"
        ? toNumber(value as string | number)
        : String(value ?? "");
  }
  return row;
}

export async function queryExploreRows(
  scope: SalesDashboardScope["filters"],
  request: {
    range: { startRow: number; endRow: number };
    sort: ExploreSort;
    filter: ExploreFilter;
    offers?: OfferFilter | null;
  },
): Promise<{ rows: ExploreRow[]; totalRows: number }> {
  const where = buildExploreWhere(
    scope,
    request.filter,
    undefined,
    request.offers,
  );
  const table = salesTransactionsTable();
  const [rowsResult, countResult] = await Promise.all([
    clickhouse.query({
      query: `
SELECT pk, ${SELECT_COLUMNS}
FROM ${table}
WHERE ${where.sql}
ORDER BY ${buildExploreOrderBy(request.sort)}
LIMIT {limit:UInt32} OFFSET {offset:UInt64}`,
      query_params: {
        ...where.params,
        limit: request.range.endRow - request.range.startRow,
        offset: request.range.startRow,
      },
      format: "JSONEachRow",
    }),
    countExploreRows(scope, request.filter, request.offers),
  ]);
  const rows = await rowsResult.json<Record<string, unknown>>();
  return { rows: rows.map(toRow), totalRows: await countResult };
}

export async function countExploreRows(
  scope: SalesDashboardScope["filters"],
  filter: ExploreFilter,
  offers?: OfferFilter | null,
): Promise<number> {
  const where = buildExploreWhere(scope, filter, undefined, offers);
  const result = await clickhouse.query({
    query: `SELECT count() AS n FROM ${salesTransactionsTable()} WHERE ${where.sql}`,
    query_params: where.params,
    format: "JSONEachRow",
  });
  const [row] = await result.json<{ n: string | number }>();
  return toNumber(row?.n ?? 0);
}

/**
 * Distinct values of one text column under every OTHER active filter, so a
 * set-filter popup lists what the data actually holds (never the screen).
 */
export async function queryExploreValues(
  scope: SalesDashboardScope["filters"],
  request: {
    colId: ExploreColumnId;
    search: string;
    filter: ExploreFilter;
    offers?: OfferFilter | null;
  },
): Promise<{ values: string[]; truncated: boolean }> {
  if (KIND.get(request.colId) !== "text") {
    return { values: [], truncated: false };
  }
  const where = buildExploreWhere(
    scope,
    request.filter,
    request.colId,
    request.offers,
  );
  const col = COLUMN_SQL[request.colId];
  const search = request.search.trim();
  const result = await clickhouse.query({
    query: `
SELECT DISTINCT ${col} AS v
FROM ${salesTransactionsTable()}
WHERE ${where.sql}
  ${search ? `AND positionCaseInsensitiveUTF8(${col}, {search:String}) > 0` : ""}
ORDER BY v
LIMIT {limit:UInt32}`,
    query_params: { ...where.params, search, limit: EXPLORE_VALUES_LIMIT + 1 },
    format: "JSONEachRow",
  });
  const rows = await result.json<{ v: string }>();
  return {
    values: rows.slice(0, EXPLORE_VALUES_LIMIT).map((row) => row.v),
    truncated: rows.length > EXPLORE_VALUES_LIMIT,
  };
}

/**
 * Offer names per order for one loaded grid page (filled in after the rows
 * so the main query stays fast). Brand-scoped: a pk from another brand just
 * comes back empty. Reads by the transaction_details primary-key prefix.
 */
export async function queryOrderOffers(
  brands: string[],
  pks: string[],
): Promise<Record<string, ExploreOrderOffer[]>> {
  const keys = pks.flatMap((pk) => {
    const match = ORDER_PK_PATTERN.exec(pk);
    return match
      ? [[match[1], Number(match[2]), Number(match[3]), Number(match[4])]]
      : [];
  });
  const result: Record<string, ExploreOrderOffer[]> = Object.fromEntries(
    pks.map((pk) => [pk, []]),
  );
  if (keys.length === 0) return result;

  const response = await clickhouse.query({
    query: `
SELECT toString(trde_date) AS d, trde_location AS l, trde_division AS v,
  trde_no AS n,
  arraySort((o) -> o.2, groupUniqArray((trde_item, item_name))) AS offers
FROM ${detailsTable()}
WHERE trde_date IN {days:Array(Date)}
  AND (trde_date, trde_location, trde_division, trde_no)
    IN {keys:Array(Tuple(Date, Int16, Int32, Int32))}
  AND lower(brand) IN {brands:Array(String)}
  AND ${OFFER_LINE_SQL}
GROUP BY trde_date, trde_location, trde_division, trde_no`,
    query_params: {
      days: [...new Set(keys.map((key) => key[0]))],
      // Plain arrays serialize as Array, not Tuple.
      keys: keys.map((key) => new TupleParam(key)),
      brands,
      offerCats: EXPLORE_OFFER_CATEGORIES,
    },
    format: "JSONEachRow",
  });
  const rows = await response.json<{
    d: string;
    l: number;
    v: number;
    n: number;
    offers: [string, string][];
  }>();
  for (const row of rows) {
    const pk = `${row.d}_${row.l}_${row.v}_${row.n}`;
    if (pk in result) {
      result[pk] = row.offers.map(([item, name]) => ({ item, name }));
    }
  }
  return result;
}

/**
 * Offers present in orders matching the date window, brands and column
 * filters (the current offer filter is ignored so the user can change it),
 * ranked by order count. `search` matches name or code — the assistant's
 * "find offers by pattern".
 */
export async function queryOfferOptions(
  scope: SalesDashboardScope["filters"],
  request: { search: string; filter: ExploreFilter },
): Promise<{ options: ExploreOfferOption[]; truncated: boolean }> {
  const where = buildExploreWhere(scope, request.filter);
  const search = request.search.trim();
  const response = await clickhouse.query({
    query: `
SELECT trde_item AS item, anyLast(item_name) AS name,
  anyLast(item_category) AS category,
  uniqExact(trde_date, trde_location, trde_division, trde_no) AS orders
FROM ${detailsTable()}
WHERE trde_date BETWEEN {from:Date} AND {to:Date}
  AND lower(brand) IN {brands:Array(String)}
  AND ${OFFER_LINE_SQL}
  AND (trde_date, trde_location, trde_division, trde_no) IN (
    SELECT tran_date, tran_location, tran_division, tran_no
    FROM ${salesTransactionsTable()}
    WHERE ${where.sql})
  ${
    search
      ? `AND (positionCaseInsensitiveUTF8(item_name, {search:String}) > 0
    OR positionCaseInsensitiveUTF8(trde_item, {search:String}) > 0)`
      : ""
  }
GROUP BY trde_item
ORDER BY orders DESC, name
LIMIT {limit:UInt32}`,
    query_params: {
      ...where.params,
      offerCats: EXPLORE_OFFER_CATEGORIES,
      search,
      limit: EXPLORE_OFFER_OPTIONS_LIMIT + 1,
    },
    format: "JSONEachRow",
  });
  const rows = await response.json<{
    item: string;
    name: string;
    category: string;
    orders: string | number;
  }>();
  return {
    options: rows.slice(0, EXPLORE_OFFER_OPTIONS_LIMIT).map((row) => ({
      item: row.item,
      name: row.name,
      category: row.category,
      orders: toNumber(row.orders),
    })),
    truncated: rows.length > EXPLORE_OFFER_OPTIONS_LIMIT,
  };
}

/**
 * Offer / combo / other split of the net of every order matching the grid,
 * plus the order discounts (`tran_discount`; `trde_discount` is the order's
 * discount PERCENT copied onto each line, never an amount). A line belongs to
 * a bundle when it is the head or its `trde_combo_item` points at a head in
 * the same order; offer wins over combo. The discount is shared out by the
 * net of discounted lines per bucket (all lines if none is flagged; "other"
 * if the order has no lines). LEFT JOIN keeps orders without detail lines
 * so `orders` and `orderNet` match the grid.
 */
export async function queryExploreBreakdown(
  scope: SalesDashboardScope["filters"],
  request: { filter: ExploreFilter; offers?: OfferFilter | null },
): Promise<ExploreValueBreakdown> {
  const where = buildExploreWhere(
    scope,
    request.filter,
    undefined,
    request.offers,
  );
  const result = await clickhouse.query({
    query: `
SELECT
  count() AS orders,
  sum(o_net) AS orderNet,
  sum(arraySum(bn)) AS lineNet,
  sum(o_disc) AS discount,
  countIf(o_disc != 0) AS discountOrders,
  sumForEach(bn) AS bucketNet,
  sumForEach(share) AS bucketDiscount,
  sumForEach(arrayMap(b -> has(k, b), [1, 2, 3])) AS bucketOrders,
  sum(o_paid) AS paid,
  quantileExact(0.5)(o_net) AS medianNet,
  sumIf(o_net, has(k, 1)) AS offerOrderNet,
  sumIf(bn[2] + bn[3], has(k, 1)) AS offerAddOnNet
FROM (
  SELECT
    toFloat64(tran_net) AS o_net,
    -- net + VAT + delivery + service: what the customer paid.
    toFloat64(tran_total) AS o_paid,
    toFloat64(tran_discount) AS o_disc,
    arrayMap(x -> multiIf(
      has(offer_heads, x.1) OR has(offer_heads, x.2), 1,
      has(combo_heads, x.1) OR has(combo_heads, x.2), 2, 3), ls) AS k,
    arrayMap(b -> arraySum(arrayMap((kk, x) -> if(kk = b, x.3, 0), k, ls)),
      [1, 2, 3]) AS bn,
    arrayMap(b -> arraySum(arrayMap((kk, x) -> if(kk = b AND x.4, x.3, 0), k, ls)),
      [1, 2, 3]) AS dn,
    multiIf(arraySum(dn) != 0, dn, arraySum(bn) != 0, bn, [0., 0., 1.]) AS w,
    arrayMap(x -> o_disc * x / arraySum(w), w) AS share
  FROM ${salesTransactionsTable()}
  LEFT JOIN (
    SELECT trde_date AS l_d, trde_location AS l_l, trde_division AS l_v,
      trde_no AS l_n,
      groupArrayIf(trde_item, ${OFFER_LINE_SQL}) AS offer_heads,
      groupArrayIf(trde_item, ${COMBO_LINE_SQL}) AS combo_heads,
      groupArray((trde_item, trde_combo_item, toFloat64(trde_net_value),
        trde_discount > 0)) AS ls
    FROM ${detailsTable()}
    WHERE trde_date BETWEEN {from:Date} AND {to:Date}
      AND lower(brand) IN {brands:Array(String)}
      AND trde_void_time = '' AND trde_item != '-1'
      -- Delivery charges (INTDELCHARGE) are lines but not part of tran_net.
      AND item_category != 'INTERNAL USE'
    GROUP BY l_d, l_l, l_v, l_n
  ) AS lines ON lines.l_d = tran_date AND lines.l_l = tran_location
    AND lines.l_v = tran_division AND lines.l_n = tran_no
  WHERE ${where.sql}
)`,
    query_params: {
      ...where.params,
      offerCats: EXPLORE_OFFER_CATEGORIES,
      comboCats: EXPLORE_COMBO_CATEGORIES,
    },
    format: "JSONEachRow",
  });
  const [row] = await result.json<{
    orders: string | number;
    orderNet: number;
    lineNet: number;
    discount: number;
    discountOrders: string | number;
    bucketNet: number[];
    bucketDiscount: number[];
    bucketOrders: (string | number)[];
    paid: number;
    medianNet: number;
    offerOrderNet: number;
    offerAddOnNet: number;
  }>();
  const at = (values: (string | number)[] | undefined, i: number) =>
    toNumber(values?.[i] ?? 0);
  return {
    orders: toNumber(row?.orders ?? 0),
    orderNet: toNumber(row?.orderNet ?? 0),
    lineNet: toNumber(row?.lineNet ?? 0),
    discount: toNumber(row?.discount ?? 0),
    discountOrders: toNumber(row?.discountOrders ?? 0),
    paid: toNumber(row?.paid ?? 0),
    medianNet: toNumber(row?.medianNet ?? 0),
    offerOrderNet: toNumber(row?.offerOrderNet ?? 0),
    offerAddOnNet: toNumber(row?.offerAddOnNet ?? 0),
    buckets: Object.fromEntries(
      VALUE_BUCKETS.map((bucket, i) => [
        bucket,
        {
          net: at(row?.bucketNet, i),
          orders: at(row?.bucketOrders, i),
          discount: at(row?.bucketDiscount, i),
        },
      ]),
    ) as ExploreValueBreakdown["buckets"],
  };
}

/**
 * One order + its lines. The header lookup is brand-scoped (not date-window
 * scoped), so a pk from another brand returns null; lines are read by the
 * transaction_details primary key prefix only after the header matched.
 */
export async function queryExploreOrder(
  brands: string[],
  pk: string,
): Promise<ExploreOrder | null> {
  const match = ORDER_PK_PATTERN.exec(pk);
  if (!match) return null;
  const [, day, location, division, no] = match;
  const key = {
    day,
    location: Number(location),
    division: Number(division),
    no: Number(no),
  };
  const table = salesTransactionsTable();

  const headerResult = await clickhouse.query({
    query: `
SELECT pk, ${SELECT_COLUMNS},
  tran_receipt AS receipt, tran_gross AS gross, tran_vat AS vat, tran_total AS total
FROM ${table}
WHERE tran_date = {day:Date} AND tran_location = {location:Int16}
  AND tran_division = {division:Int32} AND tran_no = {no:Int32}
  AND lower(brand) IN {brands:Array(String)}
LIMIT 1`,
    query_params: { ...key, brands },
    format: "JSONEachRow",
  });
  const [header] = await headerResult.json<Record<string, unknown>>();
  if (!header) return null;

  const linesResult = await clickhouse.query({
    query: `
SELECT trde_line AS line, trde_sub_line AS subLine, trde_item AS item,
  item_name AS name, item_category AS category,
  trde_qty * trde_qty_ratio AS qty, trde_net_value AS net,
  trde_gross_value AS gross, trde_discount AS discount,
  trde_coupon AS coupon, trde_is_coupon = 1 AS isCoupon,
  trde_combo_item AS comboItem,
  trde_void_time != '' OR trde_void_series_number != 0 AS voided,
  trde_comment AS comment,
  (${OFFER_LINE_SQL}) AS isOffer,
  (${COMBO_LINE_SQL}) AS isCombo
FROM ${detailsTable()}
WHERE trde_date = {day:Date} AND trde_location = {location:Int16}
  AND trde_division = {division:Int32} AND trde_no = {no:Int32}
ORDER BY trde_line, trde_sub_line`,
    query_params: {
      ...key,
      offerCats: EXPLORE_OFFER_CATEGORIES,
      comboCats: EXPLORE_COMBO_CATEGORIES,
    },
    format: "JSONEachRow",
  });
  const lines = await linesResult.json<Record<string, unknown>>();

  return {
    header: {
      ...toRow(header),
      receipt: String(header.receipt ?? ""),
      gross: toNumber(header.gross as string),
      vat: toNumber(header.vat as string),
      total: toNumber(header.total as string),
    },
    lines: lines.map((line) => ({
      line: toNumber(line.line as number),
      subLine: toNumber(line.subLine as number),
      item: String(line.item ?? ""),
      name: String(line.name ?? ""),
      category: String(line.category ?? ""),
      qty: toNumber(line.qty as string),
      net: toNumber(line.net as string),
      gross: toNumber(line.gross as string),
      discount: toNumber(line.discount as string),
      coupon: String(line.coupon ?? ""),
      isCoupon: Boolean(toNumber(line.isCoupon as number)),
      comboItem: String(line.comboItem ?? ""),
      voided: Boolean(toNumber(line.voided as number)),
      comment: String(line.comment ?? ""),
      isOffer: Boolean(toNumber(line.isOffer as number)),
      isCombo: Boolean(toNumber(line.isCombo as number)),
    })),
  };
}

/** Header labels are fixed strings from EXPLORE_COLUMNS, never user input. */
function quoteAlias(label: string): string {
  return `\`${label.replace(/[`\\]/g, "")}\``;
}

/**
 * Streams the filtered, sorted orders to `csvPath` (UTF-8 BOM + CSV with
 * header). Brand shows its display name; text cells starting with `=` get a
 * leading space so `officecli import` cannot turn them into live formulas.
 */
export async function writeExploreCsv(
  scope: SalesDashboardScope["filters"],
  brandNames: { alias: string; name: string }[],
  request: {
    sort: ExploreSort;
    filter: ExploreFilter;
    offers?: OfferFilter | null;
  },
  csvPath: string,
): Promise<void> {
  const where = buildExploreWhere(
    scope,
    request.filter,
    undefined,
    request.offers,
  );
  const select = EXPLORE_COLUMNS.map((column) => {
    let sql: string = COLUMN_SQL[column.id];
    if (column.id === "brand") {
      sql = `transform(${sql}, {aliases:Array(String)}, {names:Array(String)}, ${sql})`;
    }
    if (column.kind === "text") {
      sql = `if(startsWith(${sql}, '='), concat(' ', ${sql}), ${sql})`;
    } else if (column.kind === "number" && column.id !== "order_no") {
      sql = `round(${sql}, 2)`;
    }
    return `${sql} AS ${quoteAlias(column.label)}`;
  })
    .concat(
      "if(startsWith(o_names, '='), concat(' ', o_names), o_names) AS `Offers`",
    )
    .join(",\n  ");

  const { stream } = await clickhouse.exec({
    query: `
SELECT ${select}
FROM ${salesTransactionsTable()}
LEFT JOIN (
  SELECT trde_date AS o_d, trde_location AS o_l, trde_division AS o_v,
    trde_no AS o_n,
    arrayStringConcat(arraySort(groupUniqArray(item_name)), ', ') AS o_names
  FROM ${detailsTable()}
  WHERE trde_date BETWEEN {from:Date} AND {to:Date}
    AND lower(brand) IN {brands:Array(String)}
    AND ${OFFER_LINE_SQL}
  GROUP BY o_d, o_l, o_v, o_n
) AS o ON o.o_d = tran_date AND o.o_l = tran_location
  AND o.o_v = tran_division AND o.o_n = tran_no
WHERE ${where.sql}
ORDER BY ${buildExploreOrderBy(request.sort)}
LIMIT {limit:UInt32}
FORMAT CSVWithNames`,
    query_params: {
      ...where.params,
      aliases: brandNames.map((brand) => brand.alias),
      names: brandNames.map((brand) => brand.name),
      offerCats: EXPLORE_OFFER_CATEGORIES,
      limit: EXPLORE_EXPORT_MAX_ROWS,
    },
  });
  const file = createWriteStream(csvPath);
  file.write("﻿");
  await pipeline(stream, file);
}

/**
 * Endpoint guard: sales:view permission, a non-empty brand scope (403
 * otherwise) and, when a schema is given, a validated JSON body (400).
 */
export async function requireExploreRequest<T extends z.ZodType>(
  event: RequestEvent,
  schema?: T,
): Promise<{ scope: SalesDashboardScope; body: z.infer<T> }> {
  const { user } = await requireApiPermission(event, { sales: ["view"] });
  const scope = await resolveSalesDashboardScope(event, user.id);
  if (!scope) {
    error(403, "No brands assigned");
  }
  if (!schema) {
    return { scope, body: undefined as z.infer<T> };
  }
  const parsed = schema.safeParse(await event.request.json().catch(() => null));
  if (!parsed.success) {
    error(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }
  return { scope, body: parsed.data };
}
