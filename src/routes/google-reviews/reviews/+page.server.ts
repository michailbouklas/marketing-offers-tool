import { requirePermission } from "$lib/server/auth-guards";
import { getEntityIdsForBrand } from "$lib/services/brand-entities.server";
import { listBrands } from "$lib/services/brands.server";
import { listReviewCategories } from "$lib/services/google-reviews/categories.server";
import {
  googleReviewsSortDirections,
  reviewSortFields,
  sentimentValues,
} from "$lib/services/google-reviews/google-reviews";
import { listReviewsPage } from "$lib/services/google-reviews/reviews.server";
import { getMonitoredEntityIds } from "$lib/services/user-monitor.server";
import { redirect } from "@sveltejs/kit";
import { z } from "zod";
import type { PageServerLoad } from "./$types";

const PAGE_SIZE = 50;

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

// GET form submits include untouched fields as empty strings (e.g. `from=`),
// so every optional field must treat "" as "not set" — otherwise one empty
// param fails the combined safeParse and silently drops ALL filters.
function emptyToUndefined(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const optionalTrimmedString = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).optional(),
);

const optionalDay = z.preprocess(
  emptyToUndefined,
  z.string().regex(dayPattern).optional(),
);

const searchParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1).catch(1),
  business: optionalTrimmedString.catch(undefined),
  cid: optionalTrimmedString.catch(undefined),
  rating: z
    .preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(1).max(5).optional(),
    )
    .catch(undefined),
  sentiment: z
    .preprocess(emptyToUndefined, z.enum(sentimentValues).optional())
    .catch(undefined),
  categoryId: z
    .preprocess(emptyToUndefined, z.coerce.number().int().positive().optional())
    .catch(undefined),
  brandId: z
    .preprocess(emptyToUndefined, z.coerce.number().int().positive().optional())
    .catch(undefined),
  from: optionalDay.catch(undefined),
  to: optionalDay.catch(undefined),
  sortBy: z.enum(reviewSortFields).default("review_date").catch("review_date"),
  sortDir: z.enum(googleReviewsSortDirections).default("desc").catch("desc"),
  trackedOnly: z.literal("true").optional().catch(undefined),
});

/** Day after `day` (UTC) so an inclusive end date becomes an exclusive bound. */
function exclusiveUpperBound(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);

  return date.toISOString().slice(0, 10);
}

export const load: PageServerLoad = async (event) => {
  const { user } = await requirePermission(event, { googleReviews: ["view"] });

  const parseResult = searchParamsSchema.safeParse({
    page: event.url.searchParams.get("page") ?? 1,
    business: event.url.searchParams.get("business") ?? undefined,
    cid: event.url.searchParams.get("cid") ?? undefined,
    rating: event.url.searchParams.get("rating") ?? undefined,
    sentiment: event.url.searchParams.get("sentiment") ?? undefined,
    categoryId: event.url.searchParams.get("categoryId") ?? undefined,
    brandId: event.url.searchParams.get("brandId") ?? undefined,
    from: event.url.searchParams.get("from") ?? undefined,
    to: event.url.searchParams.get("to") ?? undefined,
    sortBy: event.url.searchParams.get("sortBy") ?? undefined,
    sortDir: event.url.searchParams.get("sortDir") ?? undefined,
    trackedOnly: event.url.searchParams.get("trackedOnly") ?? undefined,
  });

  const page = parseResult.success ? parseResult.data.page : 1;
  const businessQuery = parseResult.success
    ? (parseResult.data.business ?? null)
    : null;
  const businessCid = parseResult.success
    ? (parseResult.data.cid ?? null)
    : null;
  const rating = parseResult.success ? (parseResult.data.rating ?? null) : null;
  const sentiment = parseResult.success
    ? (parseResult.data.sentiment ?? null)
    : null;
  const categoryId = parseResult.success
    ? (parseResult.data.categoryId ?? null)
    : null;
  const brandId = parseResult.success
    ? (parseResult.data.brandId ?? null)
    : null;
  const from = parseResult.success ? (parseResult.data.from ?? null) : null;
  const to = parseResult.success ? (parseResult.data.to ?? null) : null;
  const sortBy = parseResult.success ? parseResult.data.sortBy : "review_date";
  const sortDir = parseResult.success ? parseResult.data.sortDir : "desc";
  const trackedOnly = parseResult.success
    ? parseResult.data.trackedOnly === "true"
    : false;
  let monitoredBusinessCids: string[] | null = null;

  if (trackedOnly) {
    if (!user) {
      redirect(302, "/login");
    }

    monitoredBusinessCids = [
      ...(await getMonitoredEntityIds(user.id, "googleReviews")),
    ];
  }

  const [reviewCategories, brands] = await Promise.all([
    listReviewCategories(),
    listBrands({ active: true }),
  ]);
  const categoryName =
    categoryId != null
      ? (reviewCategories.find((category) => category.id === categoryId)
          ?.category ?? null)
      : null;

  // Resolve the brand's assigned Google-business cids; a non-null empty array
  // (brand has none assigned) yields zero reviews.
  const brandBusinessCids =
    brandId != null
      ? await getEntityIdsForBrand(brandId, "googleReviewsBusiness")
      : null;
  const brandName =
    brandId != null
      ? (brands.find((brand) => brand.id === brandId)?.name ?? null)
      : null;

  return {
    businessQuery,
    businessCid,
    rating,
    sentiment,
    categoryId,
    categoryName,
    reviewCategories,
    brandId,
    brandName,
    brands,
    from,
    to,
    sortBy,
    sortDir,
    trackedOnly,
    reviewsPage: await listReviewsPage({
      page,
      pageSize: PAGE_SIZE,
      businessCid,
      businessQuery,
      rating,
      categoryId,
      sentiment,
      from,
      to: to ? exclusiveUpperBound(to) : null,
      monitoredBusinessCids,
      brandBusinessCids,
      sortBy,
      sortDir,
    }),
  };
};
