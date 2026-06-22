import { clickhouse } from "$lib/server/clickhouse";
import {
  buildWhereClause,
  googleReviewsTable,
  parseCount,
} from "$lib/server/google-reviews-db";
import type {
  GoogleReviewsSortDirection,
  NegativeCategorySortField,
  NegativeReviewCategoryRow,
} from "$lib/services/google-reviews/google-reviews";

type NegativeCategoryQueryRow = {
  category_id?: string | number | null;
  category?: string | null;
  business_count?: string | number | null;
  negative_review_count?: string | number | null;
};

type CategoryOptionRow = {
  id?: string | number | null;
  category?: string | null;
};

export type ReviewCategoryOption = {
  id: number;
  category: string;
};

export type ListNegativeReviewCategoriesOptions = {
  /** Exact business match (deep links from the business pages). */
  businessCid?: string | null;
  /** Case-insensitive substring match on the business title. */
  businessQuery?: string | null;
  /** Star rating given by the reviewer (1–5). */
  rating?: number | null;
  /** UTC ISO bounds on `review_date`. `from` inclusive, `to` exclusive. */
  from?: string | null;
  to?: string | null;
  /** Business CIDs selected from the user's Google Reviews monitor list. */
  monitoredBusinessCids?: string[] | null;
  sortBy: NegativeCategorySortField;
  sortDir: GoogleReviewsSortDirection;
};

function getSortExpression(sortBy: NegativeCategorySortField) {
  switch (sortBy) {
    case "business_count":
      return "business_count";
    case "negative_review_count":
      return "negative_review_count";
    case "category":
      return "rc.category";
  }
}

// Mirrors `reviews.server.ts` so the negative-categories page filters reviews
// identically before aggregating. Sentiment is always pinned to "negative".
function buildFilterClauses(options: ListNegativeReviewCategoriesOptions) {
  return [
    "lower(r.sentiment) = 'negative'",
    "r.category_id IS NOT NULL",
    "rc.category != ''",
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
    ...(options.from
      ? ["r.review_date >= parseDateTime64BestEffort({from:String}, 6)"]
      : []),
    ...(options.to
      ? ["r.review_date < parseDateTime64BestEffort({to:String}, 6)"]
      : []),
  ];
}

function buildFilterParams(options: ListNegativeReviewCategoriesOptions) {
  return {
    ...(options.businessCid ? { business_cid: options.businessCid } : {}),
    ...(options.businessQuery ? { business_query: options.businessQuery } : {}),
    ...(options.monitoredBusinessCids?.length
      ? { monitored_business_cids: options.monitoredBusinessCids }
      : {}),
    ...(options.rating != null ? { rating: options.rating } : {}),
    ...(options.from ? { from: options.from } : {}),
    ...(options.to ? { to: options.to } : {}),
  };
}

export async function listNegativeReviewCategories(
  options: ListNegativeReviewCategoriesOptions,
): Promise<NegativeReviewCategoryRow[]> {
  // An empty monitored set means "tracked only" with nothing tracked yet —
  // show no categories rather than every business's.
  if (
    options.monitoredBusinessCids &&
    options.monitoredBusinessCids.length === 0
  ) {
    return [];
  }

  const whereClause = buildWhereClause(buildFilterClauses(options));
  const sortExpression = getSortExpression(options.sortBy);
  const sortDirection = options.sortDir === "asc" ? "ASC" : "DESC";

  const result = await clickhouse.query({
    query: `
      SELECT
        r.category_id AS category_id,
        rc.category AS category,
        count(DISTINCT r.business_cid) AS business_count,
        count() AS negative_review_count
      FROM ${googleReviewsTable("reviews")} AS r FINAL
      LEFT JOIN ${googleReviewsTable("businesses")} AS b FINAL
        ON b.cid = r.business_cid
      INNER JOIN ${googleReviewsTable("review_categories")} AS rc FINAL
        ON rc.id = r.category_id
      ${whereClause}
      GROUP BY r.category_id, rc.category
      ORDER BY ${sortExpression} ${sortDirection}, business_count DESC, r.category_id ASC
    `,
    query_params: buildFilterParams(options),
    format: "JSONEachRow",
  });
  const rows = await result.json<NegativeCategoryQueryRow>();

  return rows
    .filter((row) => row.category != null && row.category !== "")
    .map<NegativeReviewCategoryRow>((row) => ({
      categoryId: parseCount(row.category_id),
      category: row.category as string,
      businessCount: parseCount(row.business_count),
      negativeReviewCount: parseCount(row.negative_review_count),
    }));
}

/** All named categories, for the reviews-page category filter dropdown. */
export async function listReviewCategories(): Promise<ReviewCategoryOption[]> {
  const result = await clickhouse.query({
    query: `
      SELECT rc.id AS id, rc.category AS category
      FROM ${googleReviewsTable("review_categories")} AS rc FINAL
      WHERE rc.category IS NOT NULL
        AND rc.category != ''
        AND (rc.is_active = 1 OR rc.is_active IS NULL)
      ORDER BY rc.category ASC
    `,
    format: "JSONEachRow",
  });
  const rows = await result.json<CategoryOptionRow>();

  return rows
    .filter((row) => row.category != null && row.category !== "")
    .map<ReviewCategoryOption>((row) => ({
      id: parseCount(row.id),
      category: row.category as string,
    }));
}
