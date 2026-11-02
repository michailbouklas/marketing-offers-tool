import { json } from "@sveltejs/kit";
import { exploreOrderOffersRequestSchema } from "$lib/services/sales-explore";
import {
  queryOrderOffers,
  requireExploreRequest,
} from "$lib/services/sales-explore.server";
import type { RequestHandler } from "./$types";

/** Offer names for one loaded grid page, keyed by order pk. */
export const POST: RequestHandler = async (event) => {
  const { scope, body } = await requireExploreRequest(
    event,
    exploreOrderOffersRequestSchema,
  );
  return json(
    await queryOrderOffers(
      scope.brands.map((brand) => brand.alias),
      body.pks,
    ),
  );
};
