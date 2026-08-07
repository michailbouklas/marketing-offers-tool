import { requirePermission } from "$lib/server/auth-guards";
import {
  kpiSortDirections,
  reviewSortFields,
} from "$lib/services/aggregator-kpis/aggregator-kpis";
import { withBrandStores } from "$lib/services/aggregator-kpis/brand-stores.server";
import {
  listStores,
  parseKpiFilters,
} from "$lib/services/aggregator-kpis/kpi-shared.server";
import { listReviews } from "$lib/services/aggregator-kpis/reviews.server";
import { listBrands } from "$lib/services/brands.server";
import { z } from "zod";
import type { PageServerLoad } from "./$types";

const PAGE_SIZE = 50;

// GET form submits include untouched fields as empty strings, so every optional
// field must treat "" as "not set" and fail per-field (`catch`).
function emptyToUndefined(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const extraParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1).catch(1),
  rating: z
    .preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(1).max(5).optional(),
    )
    .catch(undefined),
  query: z
    .preprocess(emptyToUndefined, z.string().trim().min(1).optional())
    .catch(undefined),
  sortBy: z.enum(reviewSortFields).default("reviewed_at").catch("reviewed_at"),
  sortDir: z.enum(kpiSortDirections).default("desc").catch("desc"),
});

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { aggregatorKpis: ["view"] });

  // Reviews span both platforms (the aggregator is a filter, not a cookie), so
  // the brand scope is resolved across every aggregator.
  const filters = await withBrandStores(
    parseKpiFilters(event.url.searchParams),
    null,
  );
  const params = event.url.searchParams;

  const parsed = extraParamsSchema.safeParse({
    page: params.get("page") ?? 1,
    rating: params.get("rating") ?? undefined,
    query: params.get("query") ?? undefined,
    sortBy: params.get("sortBy") ?? undefined,
    sortDir: params.get("sortDir") ?? undefined,
  });

  const page = parsed.success ? parsed.data.page : 1;
  const rating = parsed.success ? (parsed.data.rating ?? null) : null;
  const query = parsed.success ? (parsed.data.query ?? null) : null;
  const sortBy = parsed.success ? parsed.data.sortBy : "reviewed_at";
  const sortDir = parsed.success ? parsed.data.sortDir : "desc";

  const [reviewsPage, allStores, brands] = await Promise.all([
    listReviews({
      ...filters,
      page,
      pageSize: PAGE_SIZE,
      rating,
      query,
      sortBy,
      sortDir,
    }),
    listStores(null),
    listBrands({ active: true }),
  ]);

  // Narrow the store dropdown to the brand's stores (see `loadPeriodScope`).
  const scopedIds = filters.storeIds;
  const stores =
    scopedIds === null
      ? allStores
      : allStores.filter((store) => scopedIds.includes(store.id));

  return {
    filters,
    stores,
    brands,
    rating,
    query,
    sortBy,
    sortDir,
    reviewsPage,
  };
};
