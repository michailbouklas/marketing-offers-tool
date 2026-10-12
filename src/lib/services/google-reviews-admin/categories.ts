import { z } from "zod";

/**
 * Browser-safe types and schemas for the `/admin/google-reviews/categories`
 * tool, which edits `review_categories` in the Google Reviews scraper Postgres
 * (the source of truth the ClickHouse replica is fed from). Server queries live
 * in `./categories.server.ts`.
 */

export type ReviewCategoryRow = {
  id: number;
  category: string | null;
  summary: string | null;
  reviewCount: number;
  version: number;
  isActive: boolean;
  updatedAt: string | null;
};

export type ReviewCategoriesPage = {
  items: ReviewCategoryRow[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  /** Counts over the whole table (ignoring the current search/status filter). */
  totals: {
    all: number;
    active: number;
  };
};

export const reviewCategoryStatusFilters = [
  "all",
  "active",
  "inactive",
] as const;

export type ReviewCategoryStatusFilter =
  (typeof reviewCategoryStatusFilters)[number];

export const REVIEW_CATEGORY_NAME_MAX_LENGTH = 255;
export const REVIEW_CATEGORY_SUMMARY_MAX_LENGTH = 5000;
export const REVIEW_CATEGORY_BULK_LIMIT = 500;

/**
 * Edit-dialog form. `version` is the value the user was looking at when they
 * opened the dialog; the server uses it as an optimistic-concurrency guard
 * because the scraper pipeline also writes this table.
 */
export const reviewCategoryFormSchema = z.object({
  id: z.number().int().positive(),
  version: z.number().int().nonnegative(),
  category: z
    .string()
    .trim()
    .min(1, "Category name is required.")
    .max(
      REVIEW_CATEGORY_NAME_MAX_LENGTH,
      `Category name must be at most ${REVIEW_CATEGORY_NAME_MAX_LENGTH} characters.`,
    ),
  summary: z
    .string()
    .trim()
    .max(
      REVIEW_CATEGORY_SUMMARY_MAX_LENGTH,
      `Summary must be at most ${REVIEW_CATEGORY_SUMMARY_MAX_LENGTH} characters.`,
    ),
  isActive: z.boolean(),
});

export type ReviewCategoryFormData = z.infer<typeof reviewCategoryFormSchema>;

export function getDefaultReviewCategoryFormData(): ReviewCategoryFormData {
  return {
    id: 0,
    version: 0,
    category: "",
    summary: "",
    isActive: true,
  };
}

/** Bulk "set is_active" payload posted as JSON by the categories page. */
export const setReviewCategoriesActiveSchema = z.object({
  ids: z
    .array(z.number().int().positive())
    .min(1)
    .max(REVIEW_CATEGORY_BULK_LIMIT),
  isActive: z.boolean(),
});

export type SetReviewCategoriesActiveInput = z.infer<
  typeof setReviewCategoriesActiveSchema
>;

export type ReviewCategoryActionMessage = {
  type: "success" | "error";
  text: string;
};

/**
 * Thrown when a write would violate the Postgres unique partial index on
 * `lower(trim(category)) WHERE is_active = true` — i.e. an active category with
 * the same (case/whitespace-insensitive) name already exists.
 */
export class ReviewCategoryConflictError extends Error {
  constructor(message = "An active category with this name already exists.") {
    super(message);
    this.name = "ReviewCategoryConflictError";
  }
}

/**
 * Thrown when the row's `version` no longer matches the one the user edited
 * (someone — or the scraper pipeline — changed it in the meantime).
 */
export class ReviewCategoryStaleError extends Error {
  constructor(
    message = "This category was changed elsewhere. Reload the page and try again.",
  ) {
    super(message);
    this.name = "ReviewCategoryStaleError";
  }
}

export class ReviewCategoryNotFoundError extends Error {
  constructor(message = "This category no longer exists.") {
    super(message);
    this.name = "ReviewCategoryNotFoundError";
  }
}

/** Normalises a category name the way the Postgres unique index does. */
export function normalizeReviewCategoryName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}
