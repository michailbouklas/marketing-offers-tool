import { requirePermission } from "$lib/server/auth-guards";
import { listBusinessesPage } from "$lib/services/google-reviews/businesses.server";
import {
  businessSortFields,
  googleReviewsSortDirections,
  sentimentValues,
} from "$lib/services/google-reviews/google-reviews";
import { z } from "zod";
import type { PageServerLoad } from "./$types";

const PAGE_SIZE = 50;

// GET form submits include untouched fields as empty strings (e.g. `stars=`),
// so every optional field must treat "" as "not set" and fail per-field
// (`catch`) — otherwise one empty param fails the combined safeParse and
// silently drops ALL filters.
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

const searchParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1).catch(1),
  query: optionalTrimmedString.catch(undefined),
  stars: z
    .preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(1).max(5).optional(),
    )
    .catch(undefined),
  sentiment: z
    .preprocess(emptyToUndefined, z.enum(sentimentValues).optional())
    .catch(undefined),
  sortBy: z
    .enum(businessSortFields)
    .default("review_count")
    .catch("review_count"),
  sortDir: z.enum(googleReviewsSortDirections).default("desc").catch("desc"),
});

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { googleReviews: ["view"] });

  const parseResult = searchParamsSchema.safeParse({
    page: event.url.searchParams.get("page") ?? 1,
    query: event.url.searchParams.get("query") ?? undefined,
    stars: event.url.searchParams.get("stars") ?? undefined,
    sentiment: event.url.searchParams.get("sentiment") ?? undefined,
    sortBy: event.url.searchParams.get("sortBy") ?? undefined,
    sortDir: event.url.searchParams.get("sortDir") ?? undefined,
  });

  const page = parseResult.success ? parseResult.data.page : 1;
  const query = parseResult.success ? (parseResult.data.query ?? null) : null;
  const stars = parseResult.success ? (parseResult.data.stars ?? null) : null;
  const sentiment = parseResult.success
    ? (parseResult.data.sentiment ?? null)
    : null;
  const sortBy = parseResult.success ? parseResult.data.sortBy : "review_count";
  const sortDir = parseResult.success ? parseResult.data.sortDir : "desc";

  return {
    query,
    stars,
    sentiment,
    sortBy,
    sortDir,
    businessesPage: await listBusinessesPage({
      page,
      pageSize: PAGE_SIZE,
      query,
      stars,
      sentiment,
      sortBy,
      sortDir,
    }),
  };
};
