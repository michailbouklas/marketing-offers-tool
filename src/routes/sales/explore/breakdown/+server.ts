import { json } from "@sveltejs/kit";
import { exploreBreakdownRequestSchema } from "$lib/services/sales-explore";
import {
  queryExploreBreakdown,
  requireExploreRequest,
} from "$lib/services/sales-explore.server";
import type { RequestHandler } from "./$types";

/** Value breakdown dialog: offer / combo / other net + discounts of the grid's orders. */
export const POST: RequestHandler = async (event) => {
  const { scope, body } = await requireExploreRequest(
    event,
    exploreBreakdownRequestSchema,
  );
  return json(await queryExploreBreakdown(scope.filters, body));
};
