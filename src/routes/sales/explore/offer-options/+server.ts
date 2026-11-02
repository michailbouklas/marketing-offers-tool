import { json } from "@sveltejs/kit";
import { exploreOfferOptionsRequestSchema } from "$lib/services/sales-explore";
import {
  queryOfferOptions,
  requireExploreRequest,
} from "$lib/services/sales-explore.server";
import type { RequestHandler } from "./$types";

/** Offers Assistant list: offers in the current data, optionally searched. */
export const POST: RequestHandler = async (event) => {
  const { scope, body } = await requireExploreRequest(
    event,
    exploreOfferOptionsRequestSchema,
  );
  return json(await queryOfferOptions(scope.filters, body));
};
