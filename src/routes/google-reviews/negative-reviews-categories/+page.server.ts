import { requirePermission } from "$lib/server/auth-guards";
import { listNegativeReviewCategories } from "$lib/services/google-reviews/categories.server";
import {
  googleReviewsSortDirections,
  negativeCategorySortFields,
} from "$lib/services/google-reviews/google-reviews";
import { getMonitoredEntityIds } from "$lib/services/user-monitor.server";
import { redirect } from "@sveltejs/kit";
import { z } from "zod";
import type { PageServerLoad } from "./$types";

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
  business: optionalTrimmedString.catch(undefined),
  cid: optionalTrimmedString.catch(undefined),
  rating: z
    .preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(1).max(5).optional(),
    )
    .catch(undefined),
  from: optionalDay.catch(undefined),
  to: optionalDay.catch(undefined),
  sortBy: z
    .enum(negativeCategorySortFields)
    .default("business_count")
    .catch("business_count"),
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
    business: event.url.searchParams.get("business") ?? undefined,
    cid: event.url.searchParams.get("cid") ?? undefined,
    rating: event.url.searchParams.get("rating") ?? undefined,
    from: event.url.searchParams.get("from") ?? undefined,
    to: event.url.searchParams.get("to") ?? undefined,
    sortBy: event.url.searchParams.get("sortBy") ?? undefined,
    sortDir: event.url.searchParams.get("sortDir") ?? undefined,
    trackedOnly: event.url.searchParams.get("trackedOnly") ?? undefined,
  });

  const businessQuery = parseResult.success
    ? (parseResult.data.business ?? null)
    : null;
  const businessCid = parseResult.success
    ? (parseResult.data.cid ?? null)
    : null;
  const rating = parseResult.success ? (parseResult.data.rating ?? null) : null;
  const from = parseResult.success ? (parseResult.data.from ?? null) : null;
  const to = parseResult.success ? (parseResult.data.to ?? null) : null;
  const sortBy = parseResult.success
    ? parseResult.data.sortBy
    : "business_count";
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

  return {
    businessQuery,
    businessCid,
    rating,
    from,
    to,
    sortBy,
    sortDir,
    trackedOnly,
    categories: await listNegativeReviewCategories({
      businessCid,
      businessQuery,
      rating,
      from,
      to: to ? exclusiveUpperBound(to) : null,
      monitoredBusinessCids,
      sortBy,
      sortDir,
    }),
  };
};
