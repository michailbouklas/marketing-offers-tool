import { json } from "@sveltejs/kit";
import { exploreRowsRequestSchema } from "$lib/services/sales-explore";
import {
  queryExploreRows,
  requireExploreRequest,
} from "$lib/services/sales-explore.server";
import type { RequestHandler } from "./$types";

/** One grid page. Date window + brands come from the URL, the rest from the body. */
export const POST: RequestHandler = async (event) => {
  const { scope, body } = await requireExploreRequest(
    event,
    exploreRowsRequestSchema,
  );
  return json(await queryExploreRows(scope.filters, body));
};
