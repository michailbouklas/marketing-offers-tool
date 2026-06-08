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
  CompetitionRestaurantRow,
  CompetitionSortDirection,
  MenuCategory,
  MenuProduct,
  OfferHistory,
  OfferStatusTransition,
  OfferTimeSeriesPoint,
  Paginated,
  RestaurantDetail,
  RestaurantInfo,
  RestaurantSortField,
} from "$lib/services/competition/competition";

type RestaurantQueryRow = {
  id: number;
  external_id?: string | null;
  name: string;
  slug?: string | null;
  page_title?: string | null;
  processor_id: number;
  processor_name?: string | null;
  rating?: string | number | null;
  rating_count?: number | null;
  rating_scale?: string | number | null;
  minimum_order?: string | number | null;
  delivery_info?: string | null;
  source_url?: string | null;
  created_at_iso?: string | null;
  updated_at_iso?: string | null;
};

type CountRow = {
  total: string | number;
};

type ActiveOfferCountRow = {
  restaurant_id: number;
  active_offers: string | number;
};

type MenuQueryRow = {
  category_id?: number | null;
  category_name?: string | null;
  category_item_count?: number | null;
  id: number;
  name: string;
  description?: string | null;
  price?: string | number | null;
  is_offer?: number | null;
};

type TimeSeriesQueryRow = {
  offer_id: number;
  offer_name?: string | null;
  offer_active?: number | null;
  snapshot_active?: number | null;
  price?: string | number | null;
  effective_at_iso: string;
};

type ActiveOfferQueryRow = {
  id: number;
  name: string;
  description?: string | null;
  product_id?: number | null;
  is_active?: number | null;
  price?: string | number | null;
  first_seen_iso?: string | null;
  last_seen_iso?: string | null;
};

export type ListRestaurantsOptions = {
  page: number;
  pageSize: number;
  query?: string | null;
  processorId?: number | null;
  sortBy: RestaurantSortField;
  sortDir: CompetitionSortDirection;
};

function getSortExpression(sortBy: RestaurantSortField) {
  switch (sortBy) {
    case "name":
      return "r.name";
    case "processor_name":
      return "ifNull(a.display_name, ifNull(a.name, ''))";
    case "rating":
      return "ifNull(r.rating_value, -1)";
    // Sorted client-side after the active-offer counts are merged in; the
    // ClickHouse query falls back to name order.
    case "active_offer_count":
      return "r.name";
  }
}

function buildFilterClauses(options: ListRestaurantsOptions) {
  return [
    ...(options.query
      ? ["positionCaseInsensitiveUTF8(r.name, {query:String}) > 0"]
      : []),
    ...(options.processorId != null
      ? ["r.aggregator_id = {processor_id:Int32}"]
      : []),
  ];
}

function buildFilterParams(options: ListRestaurantsOptions) {
  return {
    ...(options.query ? { query: options.query } : {}),
    ...(options.processorId != null
      ? { processor_id: options.processorId }
      : {}),
  };
}

async function fetchActiveOfferCounts(restaurantIds: number[]) {
  if (restaurantIds.length === 0) {
    return new Map<number, number>();
  }

  const result = await clickhouse.query({
    query: `
      SELECT restaurant_id, count() AS active_offers
      FROM ${competitionTable("offer")} FINAL
      WHERE is_active = 1
        AND restaurant_id IN ({restaurant_ids:Array(Int32)})
      GROUP BY restaurant_id
    `,
    query_params: {
      restaurant_ids: restaurantIds,
    },
    format: "JSONEachRow",
  });
  const rows = await result.json<ActiveOfferCountRow>();

  return new Map(
    rows.map((row) => [row.restaurant_id, parseCount(row.active_offers)]),
  );
}

export async function listRestaurantsPage(
  options: ListRestaurantsOptions,
): Promise<Paginated<CompetitionRestaurantRow>> {
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
      FROM ${competitionTable("restaurant")} AS r FINAL
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
        r.id AS id,
        r.provider_external_id AS external_id,
        r.name AS name,
        r.aggregator_id AS processor_id,
        coalesce(nullIf(a.display_name, ''), a.name) AS processor_name,
        r.rating_value AS rating,
        r.rating_count AS rating_count,
        r.minimum_order AS minimum_order,
        r.delivery_info AS delivery_info,
        r.source_url AS source_url
      FROM ${competitionTable("restaurant")} AS r FINAL
      LEFT JOIN ${competitionTable("aggregator")} AS a FINAL ON a.id = r.aggregator_id
      ${whereClause}
      ORDER BY ${sortExpression} ${sortDirection}, r.id ASC
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
  const rows = await rowsResult.json<RestaurantQueryRow>();
  const activeOfferCounts = await fetchActiveOfferCounts(
    rows.map((row) => row.id),
  );

  const items = rows.map<CompetitionRestaurantRow>((row) => ({
    id: row.id,
    externalId: row.external_id ?? "",
    name: row.name,
    processorId: row.processor_id,
    processorName: row.processor_name ?? null,
    rating: parseNullableNumber(row.rating),
    ratingCount: row.rating_count ?? null,
    minimumOrder: parseNullableNumber(row.minimum_order),
    deliveryInfo: row.delivery_info ?? null,
    sourceUrl: row.source_url ?? null,
    activeOfferCount: activeOfferCounts.get(row.id) ?? 0,
    trackState: null,
    isMonitored: false,
  }));

  if (options.sortBy === "active_offer_count") {
    const direction = options.sortDir === "desc" ? -1 : 1;
    items.sort((a, b) => direction * (a.activeOfferCount - b.activeOfferCount));
  }

  return {
    items,
    page: effectivePage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
  };
}

function groupMenuRows(rows: MenuQueryRow[], currency: string): MenuCategory[] {
  const categories = new Map<string, MenuCategory>();

  for (const row of rows) {
    const categoryId = row.category_id ?? null;
    const key = categoryId === null ? "uncategorized" : String(categoryId);
    let category = categories.get(key);

    if (!category) {
      category = {
        id: categoryId,
        name: row.category_name ?? "Uncategorized",
        itemCount: row.category_item_count ?? null,
        products: [],
      };
      categories.set(key, category);
    }

    category.products.push({
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      price: parseNullableNumber(row.price),
      currency,
      isOffer: row.is_offer === 1,
    } satisfies MenuProduct);
  }

  return [...categories.values()];
}

/**
 * Collapse a chronological list of scrape points into status-change events.
 * A transition is emitted only when the status differs from the previous
 * point, so a run of "active" scrapes yields a single "activated" event and the
 * following "inactive" scrape yields a single "went inactive" event.
 * Expects `points` ordered oldest-first (the query sorts by recorded_at ASC).
 */
function computeTransitions(
  points: OfferTimeSeriesPoint[],
): OfferStatusTransition[] {
  const transitions: OfferStatusTransition[] = [];
  let previousStatus: string | null = null;

  for (const point of points) {
    if (point.status !== previousStatus) {
      transitions.push({
        status: point.status,
        effectiveAt: point.effectiveAt,
        price: point.price,
      });
      previousStatus = point.status;
    }
  }

  return transitions;
}

function groupTimeSeriesRows(rows: TimeSeriesQueryRow[]): OfferHistory[] {
  const histories = new Map<number, OfferHistory>();

  for (const row of rows) {
    let history = histories.get(row.offer_id);

    if (!history) {
      history = {
        offerId: row.offer_id,
        offerName: row.offer_name ?? `Offer #${row.offer_id}`,
        active: row.offer_active === 1,
        points: [],
        transitions: [],
      };
      histories.set(row.offer_id, history);
    }

    history.points.push({
      effectiveAt: row.effective_at_iso,
      status: row.snapshot_active === 1 ? "active" : "inactive",
      price: parseNullableNumber(row.price),
    });
  }

  for (const history of histories.values()) {
    history.transitions = computeTransitions(history.points);
  }

  return [...histories.values()];
}

export async function getRestaurantDetail(
  processorId: number,
  restaurantId: number,
): Promise<RestaurantDetail | null> {
  const detailParams = {
    restaurant_id: restaurantId,
    processor_id: processorId,
  };
  const currency = getCompetitionCurrency();
  // Scope the latest-price aggregation to this restaurant's products.
  const restaurantPriceSubquery = latestProductPriceSubquery(
    `product_id IN (
       SELECT id FROM ${competitionTable("product")} FINAL
       WHERE restaurant_id = {restaurant_id:Int32}
     )`,
  );

  const [restaurantRows, offerRows, menuRows, timeSeriesRows] =
    await Promise.all([
      clickhouse
        .query({
          query: `
            SELECT
              r.id AS id,
              r.provider_external_id AS external_id,
              r.name AS name,
              r.slug AS slug,
              r.page_title AS page_title,
              r.aggregator_id AS processor_id,
              coalesce(nullIf(a.display_name, ''), a.name) AS processor_name,
              r.rating_value AS rating,
              r.rating_count AS rating_count,
              r.rating_scale AS rating_scale,
              r.minimum_order AS minimum_order,
              r.delivery_info AS delivery_info,
              r.source_url AS source_url,
              ${utcIsoExpression("r.created_at")} AS created_at_iso,
              ${utcIsoExpression("r.updated_at")} AS updated_at_iso
            FROM ${competitionTable("restaurant")} AS r FINAL
            LEFT JOIN ${competitionTable("aggregator")} AS a FINAL ON a.id = r.aggregator_id
            WHERE r.id = {restaurant_id:Int32}
              AND r.aggregator_id = {processor_id:Int32}
            LIMIT 1
          `,
          query_params: detailParams,
          format: "JSONEachRow",
        })
        .then((result) => result.json<RestaurantQueryRow>()),
      clickhouse
        .query({
          query: `
            SELECT
              o.id AS id,
              o.title AS name,
              o.description AS description,
              o.product_id AS product_id,
              o.is_active AS is_active,
              pp.price AS price,
              ${utcIsoExpression("o.first_seen_at")} AS first_seen_iso,
              ${utcIsoExpression("o.last_seen_at")} AS last_seen_iso
            FROM ${competitionTable("offer")} AS o FINAL
            LEFT JOIN (${restaurantPriceSubquery}) AS pp ON pp.product_id = o.product_id
            WHERE o.restaurant_id = {restaurant_id:Int32}
              AND o.is_active = 1
            ORDER BY o.title ASC, o.id ASC
          `,
          query_params: detailParams,
          format: "JSONEachRow",
        })
        .then((result) => result.json<ActiveOfferQueryRow>()),
      clickhouse
        .query({
          query: `
            SELECT
              c.id AS category_id,
              c.name AS category_name,
              c.item_count AS category_item_count,
              pr.id AS id,
              pr.title AS name,
              pr.description AS description,
              pp.price AS price,
              pr.is_offer AS is_offer
            FROM ${competitionTable("product")} AS pr FINAL
            LEFT JOIN ${competitionTable("restaurant_category")} AS c FINAL ON c.id = pr.category_id
            LEFT JOIN (${restaurantPriceSubquery}) AS pp ON pp.product_id = pr.id
            WHERE pr.restaurant_id = {restaurant_id:Int32}
            ORDER BY
              ifNull(c.name, '') ASC,
              pr.title ASC
          `,
          query_params: detailParams,
          format: "JSONEachRow",
        })
        .then((result) => result.json<MenuQueryRow>()),
      clickhouse
        .query({
          query: `
            SELECT
              os.offer_id AS offer_id,
              o.title AS offer_name,
              o.is_active AS offer_active,
              os.is_active AS snapshot_active,
              pp.price AS price,
              ${utcIsoExpression("os.recorded_at")} AS effective_at_iso
            FROM ${competitionTable("offer_snapshot")} AS os FINAL
            INNER JOIN ${competitionTable("offer")} AS o FINAL ON o.id = os.offer_id
            LEFT JOIN ${competitionTable("product_price")} AS pp FINAL
              ON pp.product_id = os.product_id AND pp.session_id = os.session_id
            WHERE o.restaurant_id = {restaurant_id:Int32}
            ORDER BY os.offer_id ASC, os.recorded_at ASC
          `,
          query_params: detailParams,
          format: "JSONEachRow",
        })
        .then((result) => result.json<TimeSeriesQueryRow>()),
    ]);

  const restaurantRow = restaurantRows[0];

  if (!restaurantRow) {
    return null;
  }

  const restaurant: RestaurantInfo = {
    id: restaurantRow.id,
    externalId: restaurantRow.external_id ?? "",
    name: restaurantRow.name,
    slug: restaurantRow.slug ?? null,
    pageTitle: restaurantRow.page_title ?? null,
    processorId: restaurantRow.processor_id,
    processorName: restaurantRow.processor_name ?? null,
    rating: parseNullableNumber(restaurantRow.rating),
    ratingCount: restaurantRow.rating_count ?? null,
    ratingScale: parseNullableNumber(restaurantRow.rating_scale),
    minimumOrder: parseNullableNumber(restaurantRow.minimum_order),
    deliveryInfo: restaurantRow.delivery_info ?? null,
    sourceUrl: restaurantRow.source_url ?? null,
    createdAt: restaurantRow.created_at_iso ?? null,
    updatedAt: restaurantRow.updated_at_iso ?? null,
  };

  const activeOffers = offerRows.map<CompetitionOfferRow>((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    price: parseNullableNumber(row.price),
    currency,
    isActive: row.is_active === 1,
    firstSeen: row.first_seen_iso ?? null,
    lastSeen: row.last_seen_iso ?? null,
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    processorId: restaurant.processorId,
    processorName: restaurant.processorName,
  }));

  return {
    restaurant,
    activeOffers,
    menu: groupMenuRows(menuRows, currency),
    offerHistories: groupTimeSeriesRows(timeSeriesRows),
  };
}
