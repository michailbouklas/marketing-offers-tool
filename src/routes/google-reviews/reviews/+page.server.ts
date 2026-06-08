import { requirePermission } from "$lib/server/auth-guards";
import {
  googleReviewsSortDirections,
  reviewSortFields,
  sentimentValues,
} from "$lib/services/google-reviews/google-reviews";
import { listReviewsPage } from "$lib/services/google-reviews/reviews.server";
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
  from: optionalDay.catch(undefined),
  to: optionalDay.catch(undefined),
  sortBy: z.enum(reviewSortFields).default("review_date").catch("review_date"),
  sortDir: z.enum(googleReviewsSortDirections).default("desc").catch("desc"),
});

/** Day after `day` (UTC) so an inclusive end date becomes an exclusive bound. */
function exclusiveUpperBound(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);

  return date.toISOString().slice(0, 10);
}

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { googleReviews: ["view"] });

  const parseResult = searchParamsSchema.safeParse({
    page: event.url.searchParams.get("page") ?? 1,
    business: event.url.searchParams.get("business") ?? undefined,
    cid: event.url.searchParams.get("cid") ?? undefined,
    rating: event.url.searchParams.get("rating") ?? undefined,
    sentiment: event.url.searchParams.get("sentiment") ?? undefined,
    from: event.url.searchParams.get("from") ?? undefined,
    to: event.url.searchParams.get("to") ?? undefined,
    sortBy: event.url.searchParams.get("sortBy") ?? undefined,
    sortDir: event.url.searchParams.get("sortDir") ?? undefined,
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
  const from = parseResult.success ? (parseResult.data.from ?? null) : null;
  const to = parseResult.success ? (parseResult.data.to ?? null) : null;
  const sortBy = parseResult.success ? parseResult.data.sortBy : "review_date";
  const sortDir = parseResult.success ? parseResult.data.sortDir : "desc";

  return {
    businessQuery,
    businessCid,
    rating,
    sentiment,
    from,
    to,
    sortBy,
    sortDir,
    reviewsPage: await listReviewsPage({
      page,
      pageSize: PAGE_SIZE,
      businessCid,
      businessQuery,
      rating,
      sentiment,
      from,
      to: to ? exclusiveUpperBound(to) : null,
      sortBy,
      sortDir,
    }),
  };
};
