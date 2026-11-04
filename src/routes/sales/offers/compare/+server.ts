import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { requireExploreRequest } from "$lib/services/sales-explore.server";
import { getOfferDailyRows } from "$lib/services/sales-offers.server";
import type { RequestHandler } from "./$types";

const compareSchema = z.object({
  brand: z.string().trim().toLowerCase(),
  codes: z.array(z.string().trim().min(1)).length(2),
});

/** Offer VS dialog: daily sales of the two picked offers. */
export const POST: RequestHandler = async (event) => {
  const { scope, body } = await requireExploreRequest(event, compareSchema);
  if (!scope.brands.some((brand) => brand.alias === body.brand)) {
    error(403, "Brand not in your scope");
  }
  return json(await getOfferDailyRows(body.brand, body.codes));
};
