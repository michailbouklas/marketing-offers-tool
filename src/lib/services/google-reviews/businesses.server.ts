import { clickhouse } from "$lib/server/clickhouse";
import {
  buildWhereClause,
  googleReviewsTable,
  parseCount,
  parseNullableNumber,
  utcIsoExpression,
} from "$lib/server/google-reviews-db";
import type {
  BusinessDetail,
  BusinessFeature,
  BusinessProfile,
  BusinessSentimentMetrics,
  BusinessSortField,
  GoogleBusinessRow,
  GoogleReviewsSortDirection,
  OperatingHour,
  OrderingOption,
  Paginated,
  SentimentValue,
  StarBreakdown,
} from "$lib/services/google-reviews/google-reviews";
import { mapReviewRow } from "$lib/services/google-reviews/reviews.server";

type BusinessQueryRow = {
  cid: string;
  title: string;
  category?: string | null;
  address?: string | null;
  average_rating?: string | number | null;
  review_count?: string | number | null;
  positive_count?: string | number | null;
  neutral_count?: string | number | null;
  negative_count?: string | number | null;
};

type CountRow = {
  total: string | number;
};

type ProfileQueryRow = {
  cid: string;
  title: string;
  category?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  status?: string | null;
  description?: string | null;
  thumbnail?: string | null;
  price_range?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  reviews_link?: string | null;
  created_at_iso?: string | null;
  updated_at_iso?: string | null;
};

type StarBreakdownQueryRow = {
  review_count?: string | number | null;
  average_rating?: string | number | null;
  rating_1_count?: string | number | null;
  rating_2_count?: string | number | null;
  rating_3_count?: string | number | null;
  rating_4_count?: string | number | null;
  rating_5_count?: string | number | null;
};

type SentimentMetricsQueryRow = {
  total_reviews: string | number;
  positive_count: string | number;
  negative_count: string | number;
  neutral_count: string | number;
  positive_percentage?: string | number | null;
  negative_percentage?: string | number | null;
  neutral_percentage?: string | number | null;
  sentiment_score?: string | number | null;
  last_updated_iso?: string | null;
};

type ReviewQueryRow = Parameters<typeof mapReviewRow>[0];

type FeatureQueryRow = {
  feature_category: string;
  feature_name: string;
  is_enabled?: number | null;
};

type OperatingHourQueryRow = {
  day_of_week: string;
  hours: string;
};

type OrderingOptionQueryRow = {
  platform_name: string;
  order_url: string;
};

const RECENT_REVIEWS_LIMIT = 20;

const WEEKDAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export type ListBusinessesOptions = {
  page: number;
  pageSize: number;
  /** Case-insensitive substring match on the business title. */
  query?: string | null;
  /** Whole-star bucket of the average rating (1–5). */
  stars?: number | null;
  /** Dominant sentiment across the business's analyzed reviews. */
  sentiment?: SentimentValue | null;
  sortBy: BusinessSortField;
  sortDir: GoogleReviewsSortDirection;
};

function getSortExpression(sortBy: BusinessSortField) {
  switch (sortBy) {
    case "title":
      return "b.title";
    case "category":
      return "ifNull(b.category, '')";
    case "average_rating":
      return "ifNull(rs.average_rating, -1)";
    case "review_count":
      return "ifNull(rs.review_count, -1)";
    case "negative_count":
      return "ifNull(rs.negative_count, -1)";
  }
}

function buildSentimentClause(sentiment: SentimentValue) {
  const counts = {
    positive: "ifNull(rs.positive_count, 0)",
    neutral: "ifNull(rs.neutral_count, 0)",
    negative: "ifNull(rs.negative_count, 0)",
  };
  const own = counts[sentiment];
  const others = Object.entries(counts)
    .filter(([key]) => key !== sentiment)
    .map(([, expression]) => expression);

  // Dominant sentiment: at least as many reviews as each other bucket, and at
  // least one analyzed review (otherwise an all-zero row matches everything).
  return `${own} >= greatest(${others.join(", ")}) AND ${own} > 0`;
}

function buildFilterClauses(options: ListBusinessesOptions) {
  return [
    ...(options.query
      ? ["positionCaseInsensitiveUTF8(b.title, {query:String}) > 0"]
      : []),
    ...(options.stars != null
      ? ["floor(ifNull(rs.average_rating, -1)) = {stars:UInt8}"]
      : []),
    ...(options.sentiment ? [buildSentimentClause(options.sentiment)] : []),
  ];
}

function buildFilterParams(options: ListBusinessesOptions) {
  return {
    ...(options.query ? { query: options.query } : {}),
    ...(options.stars != null ? { stars: options.stars } : {}),
  };
}

/** Whether any filter references the joined `review_summaries` alias. */
function needsSummaryJoin(options: ListBusinessesOptions) {
  return options.stars != null || options.sentiment != null;
}

export async function listBusinessesPage(
  options: ListBusinessesOptions,
): Promise<Paginated<GoogleBusinessRow>> {
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
  const summaryJoin = `LEFT JOIN ${googleReviewsTable("review_summaries")} AS rs FINAL ON rs.business_cid = b.cid`;

  const countResult = await clickhouse.query({
    query: `
      SELECT count() AS total
      FROM ${googleReviewsTable("businesses")} AS b FINAL
      ${needsSummaryJoin(options) ? summaryJoin : ""}
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
        b.cid AS cid,
        b.title AS title,
        b.category AS category,
        b.address AS address,
        rs.average_rating AS average_rating,
        rs.review_count AS review_count,
        rs.positive_count AS positive_count,
        rs.neutral_count AS neutral_count,
        rs.negative_count AS negative_count
      FROM ${googleReviewsTable("businesses")} AS b FINAL
      ${summaryJoin}
      ${whereClause}
      ORDER BY ${sortExpression} ${sortDirection}, b.cid ASC
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
  const rows = await rowsResult.json<BusinessQueryRow>();

  const items = rows.map<GoogleBusinessRow>((row) => ({
    cid: row.cid,
    title: row.title,
    category: row.category ?? null,
    address: row.address ?? null,
    averageRating: parseNullableNumber(row.average_rating),
    reviewCount: parseCount(row.review_count),
    positiveCount: parseCount(row.positive_count),
    neutralCount: parseCount(row.neutral_count),
    negativeCount: parseCount(row.negative_count),
  }));

  return {
    items,
    page: effectivePage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
  };
}

export async function getBusinessDetail(
  cid: string,
): Promise<BusinessDetail | null> {
  const cidParam = { cid };

  const [
    profileRows,
    starRows,
    sentimentRows,
    reviewRows,
    featureRows,
    hourRows,
    orderingRows,
  ] = await Promise.all([
    clickhouse
      .query({
        query: `
          SELECT
            b.cid AS cid,
            b.title AS title,
            b.category AS category,
            b.address AS address,
            b.phone AS phone,
            b.website AS website,
            b.status AS status,
            b.description AS description,
            b.thumbnail AS thumbnail,
            b.price_range AS price_range,
            b.latitude AS latitude,
            b.longitude AS longitude,
            b.reviews_link AS reviews_link,
            ${utcIsoExpression("b.created_at")} AS created_at_iso,
            ${utcIsoExpression("b.updated_at")} AS updated_at_iso
          FROM ${googleReviewsTable("businesses")} AS b FINAL
          WHERE b.cid = {cid:String}
          LIMIT 1
        `,
        query_params: cidParam,
        format: "JSONEachRow",
      })
      .then((result) => result.json<ProfileQueryRow>()),
    clickhouse
      .query({
        query: `
          SELECT
            rs.review_count AS review_count,
            rs.average_rating AS average_rating,
            rs.rating_1_count AS rating_1_count,
            rs.rating_2_count AS rating_2_count,
            rs.rating_3_count AS rating_3_count,
            rs.rating_4_count AS rating_4_count,
            rs.rating_5_count AS rating_5_count
          FROM ${googleReviewsTable("review_summaries")} AS rs FINAL
          WHERE rs.business_cid = {cid:String}
          LIMIT 1
        `,
        query_params: cidParam,
        format: "JSONEachRow",
      })
      .then((result) => result.json<StarBreakdownQueryRow>()),
    clickhouse
      .query({
        query: `
          SELECT
            bsm.total_reviews AS total_reviews,
            bsm.positive_count AS positive_count,
            bsm.negative_count AS negative_count,
            bsm.neutral_count AS neutral_count,
            bsm.positive_percentage AS positive_percentage,
            bsm.negative_percentage AS negative_percentage,
            bsm.neutral_percentage AS neutral_percentage,
            bsm.sentiment_score AS sentiment_score,
            ${utcIsoExpression("bsm.last_updated")} AS last_updated_iso
          FROM ${googleReviewsTable("business_sentiment_metrics")} AS bsm FINAL
          WHERE bsm.business_cid = {cid:String}
          LIMIT 1
        `,
        query_params: cidParam,
        format: "JSONEachRow",
      })
      .then((result) => result.json<SentimentMetricsQueryRow>()),
    clickhouse
      .query({
        query: `
          SELECT
            r.id AS id,
            r.business_cid AS business_cid,
            r.reviewer_name AS reviewer_name,
            r.rating AS rating,
            r.review_text AS review_text,
            ${utcIsoExpression("r.review_date")} AS review_date_iso,
            r.sentiment AS sentiment,
            r.sentiment_certainty AS sentiment_certainty
          FROM ${googleReviewsTable("reviews")} AS r FINAL
          WHERE r.business_cid = {cid:String}
          ORDER BY ifNull(r.review_date, toDateTime64(0, 6)) DESC, r.id DESC
          LIMIT {limit:UInt32}
        `,
        query_params: { ...cidParam, limit: RECENT_REVIEWS_LIMIT },
        format: "JSONEachRow",
      })
      .then((result) => result.json<ReviewQueryRow>()),
    clickhouse
      .query({
        query: `
          SELECT
            bf.feature_category AS feature_category,
            bf.feature_name AS feature_name,
            bf.is_enabled AS is_enabled
          FROM ${googleReviewsTable("business_features")} AS bf FINAL
          WHERE bf.business_cid = {cid:String}
          ORDER BY bf.feature_category ASC, bf.feature_name ASC
        `,
        query_params: cidParam,
        format: "JSONEachRow",
      })
      .then((result) => result.json<FeatureQueryRow>()),
    clickhouse
      .query({
        query: `
          SELECT
            oh.day_of_week AS day_of_week,
            oh.hours AS hours
          FROM ${googleReviewsTable("operating_hours")} AS oh FINAL
          WHERE oh.business_cid = {cid:String}
        `,
        query_params: cidParam,
        format: "JSONEachRow",
      })
      .then((result) => result.json<OperatingHourQueryRow>()),
    clickhouse
      .query({
        query: `
          SELECT
            oo.platform_name AS platform_name,
            oo.order_url AS order_url
          FROM ${googleReviewsTable("ordering_options")} AS oo FINAL
          WHERE oo.business_cid = {cid:String}
          ORDER BY oo.platform_name ASC
        `,
        query_params: cidParam,
        format: "JSONEachRow",
      })
      .then((result) => result.json<OrderingOptionQueryRow>()),
  ]);

  const profileRow = profileRows[0];

  if (!profileRow) {
    return null;
  }

  const profile: BusinessProfile = {
    cid: profileRow.cid,
    title: profileRow.title,
    category: profileRow.category ?? null,
    address: profileRow.address ?? null,
    phone: profileRow.phone ?? null,
    website: profileRow.website ?? null,
    status: profileRow.status ?? null,
    description: profileRow.description ?? null,
    thumbnail: profileRow.thumbnail ?? null,
    priceRange: profileRow.price_range ?? null,
    latitude: parseNullableNumber(profileRow.latitude),
    longitude: parseNullableNumber(profileRow.longitude),
    reviewsLink: profileRow.reviews_link ?? null,
    createdAt: profileRow.created_at_iso ?? null,
    updatedAt: profileRow.updated_at_iso ?? null,
  };

  const starRow = starRows[0];
  const starBreakdown: StarBreakdown | null = starRow
    ? {
        reviewCount: parseCount(starRow.review_count),
        averageRating: parseNullableNumber(starRow.average_rating),
        buckets: [
          { stars: 1, count: parseCount(starRow.rating_1_count) },
          { stars: 2, count: parseCount(starRow.rating_2_count) },
          { stars: 3, count: parseCount(starRow.rating_3_count) },
          { stars: 4, count: parseCount(starRow.rating_4_count) },
          { stars: 5, count: parseCount(starRow.rating_5_count) },
        ],
      }
    : null;

  const sentimentRow = sentimentRows[0];
  const sentiment: BusinessSentimentMetrics | null = sentimentRow
    ? {
        totalReviews: parseCount(sentimentRow.total_reviews),
        positiveCount: parseCount(sentimentRow.positive_count),
        negativeCount: parseCount(sentimentRow.negative_count),
        neutralCount: parseCount(sentimentRow.neutral_count),
        positivePercentage: parseNullableNumber(
          sentimentRow.positive_percentage,
        ),
        negativePercentage: parseNullableNumber(
          sentimentRow.negative_percentage,
        ),
        neutralPercentage: parseNullableNumber(sentimentRow.neutral_percentage),
        sentimentScore: parseNullableNumber(sentimentRow.sentiment_score),
        lastUpdated: sentimentRow.last_updated_iso ?? null,
      }
    : null;

  const features = featureRows.map<BusinessFeature>((row) => ({
    category: row.feature_category,
    name: row.feature_name,
    isEnabled: row.is_enabled === null ? null : row.is_enabled === 1,
  }));

  const operatingHours = hourRows
    .map<OperatingHour>((row) => ({
      dayOfWeek: row.day_of_week,
      hours: row.hours,
    }))
    .sort(
      (a, b) =>
        WEEKDAY_ORDER.indexOf(a.dayOfWeek.toLowerCase()) -
        WEEKDAY_ORDER.indexOf(b.dayOfWeek.toLowerCase()),
    );

  const orderingOptions = orderingRows.map<OrderingOption>((row) => ({
    platformName: row.platform_name,
    orderUrl: row.order_url,
  }));

  return {
    profile,
    starBreakdown,
    sentiment,
    recentReviews: reviewRows.map(mapReviewRow),
    features,
    operatingHours,
    orderingOptions,
  };
}
