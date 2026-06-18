import { clickhouse } from "$lib/server/clickhouse";
import {
  buildWhereClause,
  competitionTable,
  getCompetitionCurrency,
  latestProductPriceSubquery,
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
  product_id?: number | null;
  is_active?: number | null;
  first_seen_iso?: string | null;
  last_seen_iso?: string | null;
  restaurant_id: number;
  restaurant_name?: string | null;
  processor_id: number;
  processor_name?: string | null;
};

type CountRow = {
  total: string | number;
};

type PriceRow = {
  product_id: number;
  price?: string | number | null;
};

type MonitoredRestaurantPair = {
  processorId: number;
  restaurantId: number;
};

export type ListActiveOffersOptions = {
  page: number;
  pageSize: number;
  processorId?: number | null;
  restaurantId?: number | null;
  /** Case-insensitive substring match on the restaurant name. */
  restaurantQuery?: string | null;
  /**
   * UTC ISO bounds on `first_seen_at` (when the scraper first saw the offer).
   * `from` is inclusive, `to` exclusive.
   */
  from?: string | null;
  to?: string | null;
  monitoredRestaurantKeys?: string[] | null;
  sortBy: OfferSortField;
  sortDir: CompetitionSortDirection;
};

const monitoredRestaurantKeyPattern = /^(\d+):(\d+)$/;
const CLICKHOUSE_INT32_MAX = 2_147_483_647;

function parseMonitoredRestaurantKeys(
  monitoredRestaurantKeys: string[] | null | undefined,
) {
  if (monitoredRestaurantKeys == null) {
    return null;
  }

  const uniquePairs = new Map<string, MonitoredRestaurantPair>();

  for (const monitoredRestaurantKey of monitoredRestaurantKeys) {
    const match = monitoredRestaurantKeyPattern.exec(
      monitoredRestaurantKey.trim(),
    );

    if (!match) {
      continue;
    }

    const processorId = Number.parseInt(match[1], 10);
    const restaurantId = Number.parseInt(match[2], 10);

    if (
      !Number.isSafeInteger(processorId) ||
      !Number.isSafeInteger(restaurantId) ||
      processorId <= 0 ||
      restaurantId <= 0 ||
      processorId > CLICKHOUSE_INT32_MAX ||
      restaurantId > CLICKHOUSE_INT32_MAX
    ) {
      continue;
    }

    uniquePairs.set(`${processorId}:${restaurantId}`, {
      processorId,
      restaurantId,
    });
  }

  return [...uniquePairs.values()];
}

function buildMonitoredRestaurantClause(
  monitoredRestaurantPairs: MonitoredRestaurantPair[],
) {
  if (monitoredRestaurantPairs.length === 0) {
    return null;
  }

  return `(${monitoredRestaurantPairs
    .map(
      (_, index) =>
        `(r.aggregator_id = {monitored_processor_id_${index}:Int32} AND o.restaurant_id = {monitored_restaurant_id_${index}:Int32})`,
    )
    .join(" OR ")})`;
}

function buildMonitoredRestaurantParams(
  monitoredRestaurantPairs: MonitoredRestaurantPair[] | null,
) {
  if (!monitoredRestaurantPairs) {
    return {};
  }

  return monitoredRestaurantPairs.reduce<Record<string, number>>(
    (params, pair, index) => ({
      ...params,
      [`monitored_processor_id_${index}`]: pair.processorId,
      [`monitored_restaurant_id_${index}`]: pair.restaurantId,
    }),
    {},
  );
}

function buildEmptyOffersPage(
  safePageSize: number,
): Paginated<CompetitionOfferRow> {
  return {
    items: [],
    page: 1,
    pageSize: safePageSize,
    totalItems: 0,
    totalPages: 1,
  };
}

// "price" is resolved from the product_price time-series after the page is
// fetched, so it is sorted client-side (see below); the query falls back to
// the offer title for a stable order.
function getSortExpression(sortBy: OfferSortField) {
  switch (sortBy) {
    case "name":
      return "o.title";
    case "restaurant_name":
      return "ifNull(r.name, '')";
    case "processor_name":
      return "ifNull(a.display_name, ifNull(a.name, ''))";
    case "first_seen":
      return "ifNull(o.first_seen_at, toDateTime64(0, 6))";
    case "price":
      return "o.title";
  }
}

function buildFilterClauses(
  options: ListActiveOffersOptions,
  monitoredRestaurantPairs: MonitoredRestaurantPair[] | null,
) {
  const monitoredRestaurantClause = buildMonitoredRestaurantClause(
    monitoredRestaurantPairs ?? [],
  );

  return [
    "o.is_active = 1",
    ...(options.processorId != null
      ? ["r.aggregator_id = {processor_id:Int32}"]
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
      ? ["o.first_seen_at >= parseDateTime64BestEffort({from:String}, 6)"]
      : []),
    ...(options.to
      ? ["o.first_seen_at < parseDateTime64BestEffort({to:String}, 6)"]
      : []),
    ...(monitoredRestaurantClause ? [monitoredRestaurantClause] : []),
  ];
}

function buildFilterParams(
  options: ListActiveOffersOptions,
  monitoredRestaurantPairs: MonitoredRestaurantPair[] | null,
) {
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
    ...buildMonitoredRestaurantParams(monitoredRestaurantPairs),
  };
}

/** Latest price per product id from the `product_price` time-series. */
async function fetchLatestPrices(productIds: number[]) {
  if (productIds.length === 0) {
    return new Map<number, number | null>();
  }

  const result = await clickhouse.query({
    query: latestProductPriceSubquery(
      "product_id IN ({product_ids:Array(Int32)})",
    ),
    query_params: {
      product_ids: productIds,
    },
    format: "JSONEachRow",
  });
  const rows = await result.json<PriceRow>();

  return new Map(
    rows.map((row) => [row.product_id, parseNullableNumber(row.price)]),
  );
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
  const monitoredRestaurantPairs = parseMonitoredRestaurantKeys(
    options.monitoredRestaurantKeys,
  );

  if (monitoredRestaurantPairs?.length === 0) {
    return buildEmptyOffersPage(safePageSize);
  }

  const whereClause = buildWhereClause(
    buildFilterClauses(options, monitoredRestaurantPairs),
  );
  const filterParams = buildFilterParams(options, monitoredRestaurantPairs);

  const countResult = await clickhouse.query({
    query: `
      SELECT count() AS total
      FROM ${competitionTable("offer")} AS o FINAL
      INNER JOIN ${competitionTable("restaurant")} AS r FINAL ON r.id = o.restaurant_id
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
        o.title AS name,
        o.description AS description,
        o.product_id AS product_id,
        o.is_active AS is_active,
        ${utcIsoExpression("o.first_seen_at")} AS first_seen_iso,
        ${utcIsoExpression("o.last_seen_at")} AS last_seen_iso,
        o.restaurant_id AS restaurant_id,
        r.name AS restaurant_name,
        r.aggregator_id AS processor_id,
        coalesce(nullIf(a.display_name, ''), a.name) AS processor_name
      FROM ${competitionTable("offer")} AS o FINAL
      INNER JOIN ${competitionTable("restaurant")} AS r FINAL ON r.id = o.restaurant_id
      LEFT JOIN ${competitionTable("aggregator")} AS a FINAL ON a.id = r.aggregator_id
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

  const productIds = [
    ...new Set(
      rows
        .map((row) => row.product_id)
        .filter((id): id is number => id != null),
    ),
  ];
  const prices = await fetchLatestPrices(productIds);
  const currency = getCompetitionCurrency();

  const items = rows.map<CompetitionOfferRow>((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    price: row.product_id != null ? (prices.get(row.product_id) ?? null) : null,
    currency,
    isActive: row.is_active === 1,
    firstSeen: row.first_seen_iso ?? null,
    lastSeen: row.last_seen_iso ?? null,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name ?? null,
    processorId: row.processor_id,
    processorName: row.processor_name ?? null,
  }));

  // Price lives in a separate time-series, so it is sorted within the page
  // after the merge (nulls last).
  if (options.sortBy === "price") {
    const direction = options.sortDir === "desc" ? -1 : 1;
    items.sort((a, b) => {
      if (a.price === b.price) return 0;
      if (a.price === null) return 1;
      if (b.price === null) return -1;
      return direction * (a.price - b.price);
    });
  }

  return {
    items,
    page: effectivePage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
  };
}
