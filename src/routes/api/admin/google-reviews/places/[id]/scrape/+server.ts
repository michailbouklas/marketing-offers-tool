import { error, json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import { GooglePlacesApiError } from "$lib/services/google-reviews-admin/places";
import { propagatePlaceBrand } from "$lib/services/google-reviews-admin/place-brand-sync.server";
import { getScrapeQuery } from "$lib/services/google-reviews-admin/places.server";
import { ScrapeRunAlreadyRunningError } from "$lib/services/google-reviews-admin/scrape-run";
import { startPlaceScrape } from "$lib/services/google-reviews-admin/scrape-run.server";
import type { RequestHandler } from "./$types";

/**
 * Starts an on-demand scrape for one place. Answers immediately with the run
 * snapshot; follow progress on `./stream`.
 */
export const POST: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, {
    googleReviews: ["manage"],
  });

  const placeId = Number.parseInt(event.params.id, 10);
  if (!Number.isInteger(placeId) || placeId <= 0) {
    error(400, "Invalid place id.");
  }

  try {
    // Resolve the query text (and surface a 404) before taking the run slot.
    const place = await getScrapeQuery(placeId);
    const snapshot = startPlaceScrape({
      placeId: place.id,
      query: place.query,
      brandId: place.brandId,
      userId: user.id,
      // Newly discovered businesses inherit the place's brand (see
      // place-brand-sync.server.ts). Fire-and-forget: a failure here must not
      // affect the run's reported status.
      onSucceeded: (run) => {
        void propagatePlaceBrand({
          placeId: run.placeId,
          remoteBrandId: run.brandId,
          actorUserId: user.id,
        }).catch((error: unknown) => {
          console.warn(
            `[google-reviews/places] brand propagation after scrape of place ${run.placeId} failed`,
            error,
          );
        });
      },
    });
    return json(snapshot);
  } catch (e) {
    if (e instanceof ScrapeRunAlreadyRunningError) {
      return json(
        {
          message: e.message,
          activePlaceId: e.activePlaceId,
          activeQuery: e.activeQuery,
        },
        { status: 409 },
      );
    }
    if (e instanceof GooglePlacesApiError) {
      error(e.status >= 500 ? 503 : e.status, e.message);
    }
    throw e;
  }
};
