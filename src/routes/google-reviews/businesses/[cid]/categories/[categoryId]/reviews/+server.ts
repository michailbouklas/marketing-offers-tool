import { requireApiPermission } from "$lib/server/auth-guards";
import { listReviewsPage } from "$lib/services/google-reviews/reviews.server";
import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";

const DIALOG_PAGE_SIZE = 25;

const paramsSchema = z.object({
  cid: z.string().trim().min(1),
  categoryId: z.coerce.number().int().positive(),
});

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1).catch(1),
});

export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, { googleReviews: ["view"] });

  const paramsResult = paramsSchema.safeParse(event.params);

  if (!paramsResult.success) {
    error(404, "Category not found");
  }

  const { page } = querySchema.parse({
    page: event.url.searchParams.get("page") ?? undefined,
  });

  const reviewsPage = await listReviewsPage({
    page,
    pageSize: DIALOG_PAGE_SIZE,
    businessCid: paramsResult.data.cid,
    categoryId: paramsResult.data.categoryId,
    sortBy: "review_date",
    sortDir: "desc",
  });

  return json(reviewsPage);
};
