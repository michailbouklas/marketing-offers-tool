import { merchantScrapesPrisma } from "$lib/server/merchant-scrapes-prisma";
import type {
  AggregatorValue,
  KpiFilters,
  KpiSortDirection,
  OrderDetails,
  Paginated,
  ReviewRow,
  ReviewSortField,
} from "$lib/services/aggregator-kpis/aggregator-kpis";
import {
  getKpiStore,
  storeWhere,
} from "$lib/services/aggregator-kpis/kpi-shared.server";

export type ReviewsQuery = KpiFilters & {
  page: number;
  pageSize: number;
  /** Exact star rating filter (1-5); null for all. */
  rating: number | null;
  /** Free-text search over the review comment. */
  query: string | null;
  sortBy: ReviewSortField;
  sortDir: KpiSortDirection;
};

/** `where.reviewedAt` fragment for the filter's inclusive date range. */
function reviewedAtRange(
  filters: KpiFilters,
): { gte?: Date; lt?: Date } | undefined {
  const range: { gte?: Date; lt?: Date } = {};

  if (filters.from) {
    range.gte = new Date(`${filters.from}T00:00:00Z`);
  }

  if (filters.to) {
    const upper = new Date(`${filters.to}T00:00:00Z`);
    upper.setUTCDate(upper.getUTCDate() + 1);
    range.lt = upper;
  }

  return range.gte === undefined && range.lt === undefined ? undefined : range;
}

function orderByFor(sortBy: ReviewSortField, sortDir: KpiSortDirection) {
  if (sortBy === "rating") {
    return [
      { rating: sortDir },
      { reviewedAt: { sort: sortDir, nulls: "last" as const } },
    ];
  }

  return [{ reviewedAt: { sort: sortDir, nulls: "last" as const } }];
}

type ReviewQueryRow = {
  id: number;
  storeId: number;
  externalOrderId: bigint | null;
  dedupeKey: string;
  rating: number;
  comment: string;
  reviewedAt: Date | null;
  reviewedAtRaw: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  orderDetails: unknown;
  orderScrapedAt: Date | null;
  store: { name: string | null; aggregator: string };
};

/**
 * Trust the scraper-produced JSON (our own pipeline) as an `OrderDetails`,
 * guarding only that it is a non-null object. `null`/JSON-null (not enriched)
 * and malformed values collapse to `null` so the UI hides the panel.
 */
function toOrderDetails(value: unknown): OrderDetails | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as OrderDetails;
}

function mapReviewRow(row: ReviewQueryRow): ReviewRow {
  return {
    id: row.id,
    storeId: row.storeId,
    storeName: row.store.name,
    aggregator: row.store.aggregator as AggregatorValue,
    externalOrderId: row.externalOrderId?.toString() ?? null,
    dedupeKey: row.dedupeKey,
    rating: row.rating,
    comment: row.comment,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    reviewedAtRaw: row.reviewedAtRaw,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    orderDetails: toOrderDetails(row.orderDetails),
    orderScrapedAt: row.orderScrapedAt
      ? row.orderScrapedAt.toISOString()
      : null,
  };
}

/**
 * Store header for the reviews detail page. Re-exports {@link getKpiStore} so
 * the brand lookup (and any future field) lives in exactly one place — the two
 * were byte-identical queries before.
 */
export const getReviewStore = getKpiStore;

/** Paginated list of individual reviews, filtered by store/rating/date/text. */
export async function listReviews(
  params: ReviewsQuery,
): Promise<Paginated<ReviewRow>> {
  const { page, pageSize, rating, query, sortBy, sortDir } = params;
  const range = reviewedAtRange(params);

  const where = {
    ...(rating ? { rating } : {}),
    ...(query
      ? { comment: { contains: query, mode: "insensitive" as const } }
      : {}),
    ...(range ? { reviewedAt: range } : {}),
    store: storeWhere(params),
  };

  const [totalItems, rows] = await Promise.all([
    merchantScrapesPrisma.review.count({ where }),
    merchantScrapesPrisma.review.findMany({
      where,
      orderBy: orderByFor(sortBy, sortDir),
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        storeId: true,
        externalOrderId: true,
        dedupeKey: true,
        rating: true,
        comment: true,
        reviewedAt: true,
        reviewedAtRaw: true,
        firstSeenAt: true,
        lastSeenAt: true,
        orderDetails: true,
        orderScrapedAt: true,
        store: { select: { name: true, aggregator: true } },
      },
    }),
  ]);

  return {
    items: rows.map(mapReviewRow),
    page,
    pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
  };
}
