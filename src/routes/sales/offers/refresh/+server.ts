import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { requireExploreRequest } from "$lib/services/sales-explore.server";
import { refreshOfferValues } from "$lib/services/sales-offers.server";
import type { RequestHandler } from "./$types";

const refreshSchema = z.object({ brand: z.string().trim().toLowerCase() });

/** Refresh button: recompute one brand's offer values into the cache now. */
export const POST: RequestHandler = async (event) => {
  const { scope, body } = await requireExploreRequest(event, refreshSchema);
  if (!scope.brands.some((brand) => brand.alias === body.brand)) {
    error(403, "Brand not in your scope");
  }
  return json(await refreshOfferValues(body.brand));
};
