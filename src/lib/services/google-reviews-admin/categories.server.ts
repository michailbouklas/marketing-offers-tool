import { googleReviewsPrisma } from "$lib/server/google-reviews-prisma";
import type { Prisma } from "../../../generated/google-reviews-prisma/client";
import {
  normalizeReviewCategoryName,
  ReviewCategoryConflictError,
  ReviewCategoryNotFoundError,
  ReviewCategoryStaleError,
  type ReviewCategoriesPage,
  type ReviewCategoryRow,
  type ReviewCategoryStatusFilter,
} from "./categories";

/**
 * Server-only reads/writes against `review_categories` in the Google Reviews
 * scraper Postgres (`GOOGLE_REVIEWS_DB`). Writes flow to the ClickHouse
 * replica via logical replication, so the analytics pages need no changes.
 *
 * Never select the `embedding` column (pgvector, `Unsupported` in Prisma) — the
 * explicit `select` below is what keeps the client from touching it.
 */

const DEFAULT_PAGE_SIZE = 50;

const rowSelect = {
  id: true,
  category: true,
  summary: true,
  review_count: true,
  version: true,
  is_active: true,
  updated_at: true,
} satisfies Prisma.review_categoriesSelect;

type RawRow = Prisma.review_categoriesGetPayload<{ select: typeof rowSelect }>;

function mapRow(row: RawRow): ReviewCategoryRow {
  return {
    id: row.id,
    category: row.category,
    summary: row.summary,
    reviewCount: row.review_count ?? 0,
    version: row.version ?? 0,
    isActive: row.is_active === true,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

function statusWhere(
  status: ReviewCategoryStatusFilter,
): Prisma.review_categoriesWhereInput {
  switch (status) {
    case "active":
      return { is_active: true };
    case "inactive":
      // `is_active` is nullable; treat NULL as inactive, matching the
      // ClickHouse readers which only count `is_active = 1` as active.
      return { OR: [{ is_active: false }, { is_active: null }] };
    default:
      return {};
  }
}

function isUniqueViolation(error: unknown): boolean {
  // `@prisma/adapter-pg` maps SQLSTATE 23505 to P2002 even for the partial
  // expression index on `lower(trim(category))`; `meta.target` is unusable for
  // expression indexes, so only the code is checked.
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

type ListReviewCategoriesPageOptions = {
  page: number;
  pageSize?: number;
  query: string | null;
  status: ReviewCategoryStatusFilter;
};

export async function listReviewCategoriesPage({
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  query,
  status,
}: ListReviewCategoriesPageOptions): Promise<ReviewCategoriesPage> {
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0
      ? Math.trunc(pageSize)
      : DEFAULT_PAGE_SIZE;
  const safePage = Number.isFinite(page) && page > 0 ? Math.trunc(page) : 1;
  const trimmedQuery = query?.trim() ?? "";

  const where: Prisma.review_categoriesWhereInput = {
    ...statusWhere(status),
    ...(trimmedQuery.length > 0
      ? { category: { contains: trimmedQuery, mode: "insensitive" } }
      : {}),
  };

  const [totalItems, totalAll, totalActive] = await Promise.all([
    googleReviewsPrisma.review_categories.count({ where }),
    googleReviewsPrisma.review_categories.count(),
    googleReviewsPrisma.review_categories.count({
      where: { is_active: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const effectivePage = Math.min(safePage, totalPages);

  const rows = await googleReviewsPrisma.review_categories.findMany({
    where,
    select: rowSelect,
    orderBy: [{ review_count: "desc" }, { id: "asc" }],
    skip: (effectivePage - 1) * safePageSize,
    take: safePageSize,
  });

  return {
    items: rows.map(mapRow),
    page: effectivePage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
    totals: {
      all: totalAll,
      active: totalActive,
    },
  };
}

type UpdateReviewCategoryInput = {
  id: number;
  /** The `version` the user saw; the update only applies if it still matches. */
  expectedVersion: number;
  category: string;
  summary: string;
  isActive: boolean;
};

/**
 * Updates the three editable fields. A change to `category` or `summary`
 * bumps `version`; toggling `is_active` alone leaves it untouched. Every write
 * sets `updated_at`.
 *
 * Throws `ReviewCategoryNotFoundError`, `ReviewCategoryStaleError` (version
 * mismatch) or `ReviewCategoryConflictError` (duplicate active name).
 */
export async function updateReviewCategory({
  id,
  expectedVersion,
  category,
  summary,
  isActive,
}: UpdateReviewCategoryInput): Promise<ReviewCategoryRow> {
  const current = await googleReviewsPrisma.review_categories.findUnique({
    where: { id },
    select: rowSelect,
  });

  if (!current) {
    throw new ReviewCategoryNotFoundError();
  }

  const nextCategory = category.trim();
  const nextSummary = summary.trim();
  const textChanged =
    nextCategory !== (current.category ?? "").trim() ||
    nextSummary !== (current.summary ?? "").trim();

  try {
    const result = await googleReviewsPrisma.review_categories.updateMany({
      where: { id, version: expectedVersion },
      data: {
        category: nextCategory,
        summary: nextSummary,
        is_active: isActive,
        updated_at: new Date(),
        ...(textChanged ? { version: { increment: 1 } } : {}),
      },
    });

    if (result.count === 0) {
      throw new ReviewCategoryStaleError();
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ReviewCategoryConflictError();
    }
    throw error;
  }

  const updated = await googleReviewsPrisma.review_categories.findUnique({
    where: { id },
    select: rowSelect,
  });

  if (!updated) {
    throw new ReviewCategoryNotFoundError();
  }

  return mapRow(updated);
}

/**
 * Bulk-sets `is_active` for the given ids in one atomic `updateMany`. When
 * activating, names are pre-checked against the unique partial index so the
 * error can name the offending category instead of failing the whole batch
 * with an opaque constraint error. Returns the number of rows updated.
 */
export async function setReviewCategoriesActive(
  ids: number[],
  isActive: boolean,
): Promise<number> {
  const uniqueIds = [...new Set(ids)];

  if (uniqueIds.length === 0) {
    return 0;
  }

  if (isActive) {
    const [selected, active] = await Promise.all([
      googleReviewsPrisma.review_categories.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true, category: true },
      }),
      googleReviewsPrisma.review_categories.findMany({
        where: { is_active: true, id: { notIn: uniqueIds } },
        select: { category: true },
      }),
    ]);

    const activeNames = new Set(
      active.map((row) => normalizeReviewCategoryName(row.category)),
    );
    const seen = new Set<string>();

    for (const row of selected) {
      const name = normalizeReviewCategoryName(row.category);

      if (name.length === 0) {
        continue;
      }

      if (activeNames.has(name) || seen.has(name)) {
        throw new ReviewCategoryConflictError(
          `"${row.category?.trim()}" clashes with another active category of the same name. Rename one of them first.`,
        );
      }

      seen.add(name);
    }
  }

  try {
    const result = await googleReviewsPrisma.review_categories.updateMany({
      where: { id: { in: uniqueIds } },
      data: { is_active: isActive, updated_at: new Date() },
    });

    return result.count;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ReviewCategoryConflictError();
    }
    throw error;
  }
}
