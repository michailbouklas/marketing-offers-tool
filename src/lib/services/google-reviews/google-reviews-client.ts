/**
 * Browser-safe client helpers for the `/google-reviews` section. These call the
 * route `+server.ts` endpoints with the caller's `fetch` (so SvelteKit can track
 * the request during SSR/hydration).
 */

import type { GoogleReviewRow, Paginated } from "./google-reviews";

/**
 * Fetches one page of reviews for a business filtered to a single AI-derived
 * category, newest first. Backed by
 * `…/businesses/[cid]/categories/[categoryId]/reviews`.
 */
export async function fetchCategoryReviews(
  fetchFn: typeof fetch,
  cid: string,
  categoryId: number,
  page: number,
): Promise<Paginated<GoogleReviewRow>> {
  const response = await fetchFn(
    `/google-reviews/businesses/${encodeURIComponent(cid)}/categories/${categoryId}/reviews?page=${page}`,
  );

  if (!response.ok) {
    throw new Error("Unable to load reviews for this category.");
  }

  return response.json() as Promise<Paginated<GoogleReviewRow>>;
}
