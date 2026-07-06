import { merchantScrapesPrisma } from "$lib/server/merchant-scrapes-prisma";
import type {
  AggregatorValue,
  KpiFilters,
  KpiSortDirection,
  Paginated,
  ReviewRow,
  ReviewSortField,
} from "$lib/services/aggregator-kpis/aggregator-kpis";
import { storeWhere } from "$lib/services/aggregator-kpis/kpi-shared.server";

export type ReviewsQuery = KpiFilters & {
  page: number;
  pageSize: number;
  /** Exact star rating filter (1–5); null for all. */
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
        rating: true,
        comment: true,
        reviewedAt: true,
        store: { select: { name: true, aggregator: true } },
      },
    }),
  ]);

  const items: ReviewRow[] = rows.map((row) => ({
    id: row.id,
    storeId: row.storeId,
    storeName: row.store.name,
    aggregator: row.store.aggregator as AggregatorValue,
    rating: row.rating,
    comment: row.comment,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
  }));

  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
  };
}
