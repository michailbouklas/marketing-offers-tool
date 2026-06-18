import { clickhouse } from "$lib/server/clickhouse";
import {
  buildWhereClause,
  googleReviewsTable,
  parseCount,
  parseNullableNumber,
  utcIsoExpression,
} from "$lib/server/google-reviews-db";
import type {
  GoogleReviewRow,
  GoogleReviewsSortDirection,
  Paginated,
  ReviewSortField,
  SentimentValue,
} from "$lib/services/google-reviews/google-reviews";

type ReviewQueryRow = {
  id: number;
  business_cid?: string | null;
  business_title?: string | null;
  reviewer_name: string;
  rating: number;
  review_text?: string | null;
  review_date_iso?: string | null;
  sentiment?: string | null;
  sentiment_certainty?: string | number | null;
};

type CountRow = {
  total: string | number;
};

export type ListReviewsOptions = {
  page: number;
  pageSize: number;
  /** Exact business match (deep links from the business pages). */
  businessCid?: string | null;
  /** Case-insensitive substring match on the business title. */
  businessQuery?: string | null;
  /** Star rating given by the reviewer (1–5). */
  rating?: number | null;
  /** Lowercase sentiment label from the analysis pipeline. */
  sentiment?: SentimentValue | null;
  /** UTC ISO bounds on `review_date`. `from` inclusive, `to` exclusive. */
  from?: string | null;
  to?: string | null;
  /** Business CIDs selected from the user's Google Reviews monitor list. */
  monitoredBusinessCids?: string[] | null;
  sortBy: ReviewSortField;
  sortDir: GoogleReviewsSortDirection;
};

function normalizeMonitoredBusinessCids(
  monitoredBusinessCids: string[] | null | undefined,
) {
  if (monitoredBusinessCids == null) {
    return null;
  }

  return [
    ...new Set(
      monitoredBusinessCids
        .map((businessCid) => businessCid.trim())
        .filter((businessCid) => businessCid.length > 0),
    ),
  ];
}

function buildEmptyReviewsPage(
  safePageSize: number,
): Paginated<GoogleReviewRow> {
  return {
    items: [],
    page: 1,
    pageSize: safePageSize,
    totalItems: 0,
    totalPages: 1,
  };
}

function getSortExpression(sortBy: ReviewSortField) {
  switch (sortBy) {
    case "review_date":
      return "ifNull(r.review_date, toDateTime64(0, 6))";
    case "rating":
      return "r.rating";
    case "reviewer_name":
      return "r.reviewer_name";
    case "business_title":
      return "ifNull(b.title, '')";
    case "sentiment":
      return "ifNull(r.sentiment, '')";
  }
}

function buildFilterClauses(options: ListReviewsOptions) {
  return [
    ...(options.businessCid ? ["r.business_cid = {business_cid:String}"] : []),
    ...(options.businessQuery
      ? [
          "positionCaseInsensitiveUTF8(ifNull(b.title, ''), {business_query:String}) > 0",
        ]
      : []),
    ...(options.monitoredBusinessCids?.length
      ? ["r.business_cid IN ({monitored_business_cids:Array(String)})"]
      : []),
    ...(options.rating != null ? ["r.rating = {rating:UInt8}"] : []),
    // Stored casing is not guaranteed; compare lowercased.
    ...(options.sentiment ? ["lower(r.sentiment) = {sentiment:String}"] : []),
    ...(options.from
      ? ["r.review_date >= parseDateTime64BestEffort({from:String}, 6)"]
      : []),
    ...(options.to
      ? ["r.review_date < parseDateTime64BestEffort({to:String}, 6)"]
      : []),
  ];
}

function buildFilterParams(options: ListReviewsOptions) {
  return {
    ...(options.businessCid ? { business_cid: options.businessCid } : {}),
    ...(options.businessQuery ? { business_query: options.businessQuery } : {}),
    ...(options.monitoredBusinessCids?.length
      ? { monitored_business_cids: options.monitoredBusinessCids }
      : {}),
    ...(options.rating != null ? { rating: options.rating } : {}),
    ...(options.sentiment
      ? { sentiment: options.sentiment.toLowerCase() }
      : {}),
    ...(options.from ? { from: options.from } : {}),
    ...(options.to ? { to: options.to } : {}),
  };
}

export function mapReviewRow(row: ReviewQueryRow): GoogleReviewRow {
  return {
    id: row.id,
    businessCid: row.business_cid ?? null,
    businessTitle: row.business_title ?? null,
    reviewerName: row.reviewer_name,
    rating: row.rating,
    reviewText: row.review_text ?? null,
    reviewDate: row.review_date_iso ?? null,
    sentiment: row.sentiment ? row.sentiment.toLowerCase() : null,
    sentimentCertainty: parseNullableNumber(row.sentiment_certainty),
  };
}

export async function listReviewsPage(
  options: ListReviewsOptions,
): Promise<Paginated<GoogleReviewRow>> {
  const safePage =
    Number.isFinite(options.page) && options.page > 0
      ? Math.trunc(options.page)
      : 1;
  const safePageSize =
    Number.isFinite(options.pageSize) && options.pageSize > 0
      ? Math.trunc(options.pageSize)
      : 50;
  const monitoredBusinessCids = normalizeMonitoredBusinessCids(
    options.monitoredBusinessCids,
  );

  if (monitoredBusinessCids?.length === 0) {
    return buildEmptyReviewsPage(safePageSize);
  }

  const filterOptions = {
    ...options,
    monitoredBusinessCids,
  };
  const whereClause = buildWhereClause(buildFilterClauses(filterOptions));
  const filterParams = buildFilterParams(filterOptions);

  const countResult = await clickhouse.query({
    query: `
      SELECT count() AS total
      FROM ${googleReviewsTable("reviews")} AS r FINAL
      ${
        options.businessQuery
          ? `LEFT JOIN ${googleReviewsTable("businesses")} AS b FINAL ON b.cid = r.business_cid`
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
        r.id AS id,
        r.business_cid AS business_cid,
        b.title AS business_title,
        r.reviewer_name AS reviewer_name,
        r.rating AS rating,
        r.review_text AS review_text,
        ${utcIsoExpression("r.review_date")} AS review_date_iso,
        r.sentiment AS sentiment,
        r.sentiment_certainty AS sentiment_certainty
      FROM ${googleReviewsTable("reviews")} AS r FINAL
      LEFT JOIN ${googleReviewsTable("businesses")} AS b FINAL ON b.cid = r.business_cid
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
  const rows = await rowsResult.json<ReviewQueryRow>();

  return {
    items: rows.map(mapReviewRow),
    page: effectivePage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
  };
}
