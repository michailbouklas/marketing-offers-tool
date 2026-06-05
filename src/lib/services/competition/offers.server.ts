import { clickhouse } from "$lib/server/clickhouse";
import {
  buildWhereClause,
  competitionTable,
  parseCount,
  parseNullableNumber,
  utcIsoExpression,
} from "$lib/server/competition-db";
import type {
  CompetitionOfferRow,
  CompetitionSortDirection,
  OfferSortField,
  Paginated,
} from "$lib/services/competition/competition";

type OfferQueryRow = {
  id: number;
  name: string;
  description?: string | null;
  discount_type: string;
  discount_value?: string | number | null;
  resulting_price?: string | number | null;
  currency: string;
  created_at_iso?: string | null;
  starts_at_iso?: string | null;
  ends_at_iso?: string | null;
  restaurant_id: number;
  restaurant_name?: string | null;
  processor_id: number;
  processor_name?: string | null;
};

type CountRow = {
  total: string | number;
};

export type ListActiveOffersOptions = {
  page: number;
  pageSize: number;
  processorId?: number | null;
  restaurantId?: number | null;
  /** Case-insensitive substring match on the restaurant name. */
  restaurantQuery?: string | null;
  /**
   * UTC ISO bounds on `created_at` (when the scraper first saw the offer) —
   * the aggregator `starts_at` / `ends_at` columns are always NULL in the
   * replica. `from` is inclusive, `to` exclusive.
   */
  from?: string | null;
  to?: string | null;
  sortBy: OfferSortField;
  sortDir: CompetitionSortDirection;
};

function getSortExpression(sortBy: OfferSortField) {
  switch (sortBy) {
    case "name":
      return "o.name";
    case "restaurant_name":
      return "ifNull(r.name, '')";
    case "processor_name":
      return "ifNull(p.name, '')";
    case "discount_value":
      return "ifNull(o.discount_value, -1)";
    case "resulting_price":
      return "ifNull(o.resulting_price, -1)";
    case "created_at":
      return "ifNull(o.created_at, toDateTime64(0, 6))";
  }
}

function buildFilterClauses(options: ListActiveOffersOptions) {
  return [
    "o.active = 1",
    "o.cancelled_at IS NULL",
    ...(options.processorId != null
      ? ["o.processor_id = {processor_id:Int32}"]
      : []),
    ...(options.restaurantId != null
      ? ["o.restaurant_id = {restaurant_id:Int32}"]
      : []),
    ...(options.restaurantQuery
      ? [
          "positionCaseInsensitiveUTF8(ifNull(r.name, ''), {restaurant_query:String}) > 0",
        ]
      : []),
    ...(options.from
      ? ["o.created_at >= parseDateTime64BestEffort({from:String}, 6)"]
      : []),
    ...(options.to
      ? ["o.created_at < parseDateTime64BestEffort({to:String}, 6)"]
      : []),
  ];
}

function buildFilterParams(options: ListActiveOffersOptions) {
  return {
    ...(options.processorId != null
      ? { processor_id: options.processorId }
      : {}),
    ...(options.restaurantId != null
      ? { restaurant_id: options.restaurantId }
      : {}),
    ...(options.restaurantQuery
      ? { restaurant_query: options.restaurantQuery }
      : {}),
    ...(options.from ? { from: options.from } : {}),
    ...(options.to ? { to: options.to } : {}),
  };
}

function mapOfferRow(row: OfferQueryRow): CompetitionOfferRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    discountType: row.discount_type,
    discountValue: parseNullableNumber(row.discount_value),
    resultingPrice: parseNullableNumber(row.resulting_price),
    currency: row.currency,
    createdAt: row.created_at_iso ?? null,
    startsAt: row.starts_at_iso ?? null,
    endsAt: row.ends_at_iso ?? null,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name ?? null,
    processorId: row.processor_id,
    processorName: row.processor_name ?? null,
  };
}

export async function listActiveOffersPage(
  options: ListActiveOffersOptions,
): Promise<Paginated<CompetitionOfferRow>> {
  const safePage =
    Number.isFinite(options.page) && options.page > 0
      ? Math.trunc(options.page)
      : 1;
  const safePageSize =
    Number.isFinite(options.pageSize) && options.pageSize > 0
      ? Math.trunc(options.pageSize)
      : 50;
  const whereClause = buildWhereClause(buildFilterClauses(options));
  const filterParams = buildFilterParams(options);

  const countResult = await clickhouse.query({
    query: `
      SELECT count() AS total
      FROM ${competitionTable("offers")} AS o FINAL
      ${
        options.restaurantQuery
          ? `LEFT JOIN ${competitionTable("restaurants")} AS r FINAL ON r.id = o.restaurant_id`
          : ""
      }
      ${whereClause}
    `,
    query_params: filterParams,
    format: "JSONEachRow",
  });
  const countRows = await countResult.json<CountRow>();
  const totalItems = parseCount(countRows[0]?.total);
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const effectivePage = Math.min(safePage, totalPages);
  const offset = (effectivePage - 1) * safePageSize;

  const sortExpression = getSortExpression(options.sortBy);
  const sortDirection = options.sortDir === "desc" ? "DESC" : "ASC";
  const rowsResult = await clickhouse.query({
    query: `
      SELECT
        o.id AS id,
        o.name AS name,
        o.description AS description,
        o.discount_type AS discount_type,
        o.discount_value AS discount_value,
        o.resulting_price AS resulting_price,
        o.currency AS currency,
        ${utcIsoExpression("o.created_at")} AS created_at_iso,
        ${utcIsoExpression("o.starts_at")} AS starts_at_iso,
        ${utcIsoExpression("o.ends_at")} AS ends_at_iso,
        o.restaurant_id AS restaurant_id,
        r.name AS restaurant_name,
        o.processor_id AS processor_id,
        p.name AS processor_name
      FROM ${competitionTable("offers")} AS o FINAL
      LEFT JOIN ${competitionTable("restaurants")} AS r FINAL ON r.id = o.restaurant_id
      LEFT JOIN ${competitionTable("processors")} AS p FINAL ON p.id = o.processor_id
      ${whereClause}
      ORDER BY ${sortExpression} ${sortDirection}, o.id ASC
      LIMIT {limit:UInt32}
      OFFSET {offset:UInt32}
    `,
    query_params: {
      ...filterParams,
      limit: safePageSize,
      offset,
    },
    format: "JSONEachRow",
  });
  const rows = await rowsResult.json<OfferQueryRow>();

  return {
    items: rows.map(mapOfferRow),
    page: effectivePage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
  };
}
