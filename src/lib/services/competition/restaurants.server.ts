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
  CompetitionRestaurantRow,
  CompetitionSortDirection,
  MenuCategory,
  MenuProduct,
  OfferHistory,
  Paginated,
  RestaurantDetail,
  RestaurantInfo,
  RestaurantSortField,
} from "$lib/services/competition/competition";

type RestaurantQueryRow = {
  id: number;
  external_id: string;
  name: string;
  processor_id: number;
  processor_name?: string | null;
  brand?: string | null;
  address?: string | null;
  phone?: string | null;
  rating?: string | number | null;
  delivery_fee?: string | number | null;
  minimum_order?: string | number | null;
  delivery_time?: string | null;
  cuisine_types?: string | null;
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
  category_order?: number | null;
  id: number;
  name: string;
  description?: string | null;
  price?: string | number | null;
  original_price?: string | number | null;
  currency: string;
  discount_percentage?: string | number | null;
  availability?: number | null;
  offer_name?: string | null;
  image_url?: string | null;
};

type TimeSeriesQueryRow = {
  offer_id: number;
  offer_name?: string | null;
  offer_active?: number | null;
  status: string;
  discount_value?: string | number | null;
  resulting_price?: string | number | null;
  effective_at_iso: string;
};

type ActiveOfferQueryRow = {
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
      return "ifNull(p.name, '')";
    case "brand":
      return "ifNull(r.brand, '')";
    case "rating":
      return "ifNull(r.rating, -1)";
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
      ? ["r.processor_id = {processor_id:Int32}"]
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
      FROM ${competitionTable("offers")} FINAL
      WHERE active = 1
        AND cancelled_at IS NULL
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
      FROM ${competitionTable("restaurants")} AS r FINAL
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
        r.external_id AS external_id,
        r.name AS name,
        r.processor_id AS processor_id,
        p.name AS processor_name,
        r.brand AS brand,
        r.address AS address,
        r.rating AS rating,
        r.delivery_fee AS delivery_fee,
        r.minimum_order AS minimum_order,
        r.delivery_time AS delivery_time,
        r.cuisine_types AS cuisine_types
      FROM ${competitionTable("restaurants")} AS r FINAL
      LEFT JOIN ${competitionTable("processors")} AS p FINAL ON p.id = r.processor_id
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
    externalId: row.external_id,
    name: row.name,
    processorId: row.processor_id,
    processorName: row.processor_name ?? null,
    brand: row.brand ?? null,
    address: row.address ?? null,
    rating: parseNullableNumber(row.rating),
    deliveryFee: parseNullableNumber(row.delivery_fee),
    minimumOrder: parseNullableNumber(row.minimum_order),
    deliveryTime: row.delivery_time ?? null,
    cuisineTypes: row.cuisine_types ?? "",
    activeOfferCount: activeOfferCounts.get(row.id) ?? 0,
    trackState: null,
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

function groupMenuRows(rows: MenuQueryRow[]): MenuCategory[] {
  const categories = new Map<string, MenuCategory>();

  for (const row of rows) {
    const categoryId = row.category_id ?? null;
    const key = categoryId === null ? "uncategorized" : String(categoryId);
    let category = categories.get(key);

    if (!category) {
      category = {
        id: categoryId,
        name: row.category_name ?? "Uncategorized",
        displayOrder: row.category_order ?? null,
        products: [],
      };
      categories.set(key, category);
    }

    category.products.push({
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      price: parseNullableNumber(row.price),
      originalPrice: parseNullableNumber(row.original_price),
      currency: row.currency,
      discountPercentage: parseNullableNumber(row.discount_percentage),
      available: row.availability === 1,
      offerName: row.offer_name ?? null,
      imageUrl: row.image_url ?? null,
    } satisfies MenuProduct);
  }

  return [...categories.values()];
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
      };
      histories.set(row.offer_id, history);
    }

    history.points.push({
      effectiveAt: row.effective_at_iso,
      status: row.status,
      discountValue: parseNullableNumber(row.discount_value),
      resultingPrice: parseNullableNumber(row.resulting_price),
    });
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

  const [restaurantRows, offerRows, menuRows, timeSeriesRows] =
    await Promise.all([
      clickhouse
        .query({
          query: `
            SELECT
              r.id AS id,
              r.external_id AS external_id,
              r.name AS name,
              r.processor_id AS processor_id,
              p.name AS processor_name,
              r.brand AS brand,
              r.address AS address,
              r.phone AS phone,
              r.rating AS rating,
              r.delivery_fee AS delivery_fee,
              r.minimum_order AS minimum_order,
              r.delivery_time AS delivery_time,
              r.cuisine_types AS cuisine_types,
              ${utcIsoExpression("r.created_at")} AS created_at_iso,
              ${utcIsoExpression("r.updated_at")} AS updated_at_iso
            FROM ${competitionTable("restaurants")} AS r FINAL
            LEFT JOIN ${competitionTable("processors")} AS p FINAL ON p.id = r.processor_id
            WHERE r.id = {restaurant_id:Int32}
              AND r.processor_id = {processor_id:Int32}
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
              o.name AS name,
              o.description AS description,
              o.discount_type AS discount_type,
              o.discount_value AS discount_value,
              o.resulting_price AS resulting_price,
              o.currency AS currency,
              ${utcIsoExpression("o.created_at")} AS created_at_iso,
              ${utcIsoExpression("o.starts_at")} AS starts_at_iso,
              ${utcIsoExpression("o.ends_at")} AS ends_at_iso
            FROM ${competitionTable("offers")} AS o FINAL
            WHERE o.restaurant_id = {restaurant_id:Int32}
              AND o.processor_id = {processor_id:Int32}
              AND o.active = 1
              AND o.cancelled_at IS NULL
            ORDER BY o.name ASC, o.id ASC
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
              c.display_order AS category_order,
              pr.id AS id,
              pr.name AS name,
              pr.description AS description,
              pr.price AS price,
              pr.original_price AS original_price,
              pr.currency AS currency,
              pr.discount_percentage AS discount_percentage,
              pr.availability AS availability,
              pr.offer_name AS offer_name,
              pr.image_url AS image_url
            FROM ${competitionTable("products")} AS pr FINAL
            LEFT JOIN ${competitionTable("categories")} AS c FINAL ON c.id = pr.category_id
            WHERE pr.restaurant_id = {restaurant_id:Int32}
              AND pr.processor_id = {processor_id:Int32}
            ORDER BY
              isNull(c.display_order) ASC,
              c.display_order ASC,
              ifNull(c.name, '') ASC,
              isNull(pr.display_order) ASC,
              pr.display_order ASC,
              pr.name ASC
          `,
          query_params: detailParams,
          format: "JSONEachRow",
        })
        .then((result) => result.json<MenuQueryRow>()),
      clickhouse
        .query({
          query: `
            SELECT
              ots.offer_id AS offer_id,
              o.name AS offer_name,
              o.active AS offer_active,
              ots.status AS status,
              ots.discount_value AS discount_value,
              ots.resulting_price AS resulting_price,
              ${utcIsoExpression("ots.effective_at")} AS effective_at_iso
            FROM ${competitionTable("offer_time_series")} AS ots FINAL
            INNER JOIN ${competitionTable("offers")} AS o FINAL ON o.id = ots.offer_id
            WHERE o.restaurant_id = {restaurant_id:Int32}
              AND o.processor_id = {processor_id:Int32}
            ORDER BY ots.offer_id ASC, ots.effective_at ASC
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
    externalId: restaurantRow.external_id,
    name: restaurantRow.name,
    processorId: restaurantRow.processor_id,
    processorName: restaurantRow.processor_name ?? null,
    brand: restaurantRow.brand ?? null,
    address: restaurantRow.address ?? null,
    phone: restaurantRow.phone ?? null,
    rating: parseNullableNumber(restaurantRow.rating),
    deliveryFee: parseNullableNumber(restaurantRow.delivery_fee),
    minimumOrder: parseNullableNumber(restaurantRow.minimum_order),
    deliveryTime: restaurantRow.delivery_time ?? null,
    cuisineTypes: restaurantRow.cuisine_types ?? "",
    createdAt: restaurantRow.created_at_iso ?? null,
    updatedAt: restaurantRow.updated_at_iso ?? null,
  };

  const activeOffers = offerRows.map<CompetitionOfferRow>((row) => ({
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
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    processorId: restaurant.processorId,
    processorName: restaurant.processorName,
  }));

  return {
    restaurant,
    activeOffers,
    menu: groupMenuRows(menuRows),
    offerHistories: groupTimeSeriesRows(timeSeriesRows),
  };
}
