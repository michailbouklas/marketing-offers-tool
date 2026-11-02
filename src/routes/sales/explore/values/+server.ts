import { json } from "@sveltejs/kit";
import { exploreValuesRequestSchema } from "$lib/services/sales-explore";
import {
  queryExploreValues,
  requireExploreRequest,
} from "$lib/services/sales-explore.server";
import type { RequestHandler } from "./$types";

/** Distinct values for a column's set filter, under every other active filter. */
export const POST: RequestHandler = async (event) => {
  const { scope, body } = await requireExploreRequest(
    event,
    exploreValuesRequestSchema,
  );
  return json(await queryExploreValues(scope.filters, body));
};
