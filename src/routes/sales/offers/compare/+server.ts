import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { isIsoDate } from "$lib/services/sales-dashboard";
import { requireExploreRequest } from "$lib/services/sales-explore.server";
import { getOfferDailyRows } from "$lib/services/sales-offers.server";
import type { RequestHandler } from "./$types";

const isoDate = z.string().refine(isIsoDate, "Invalid date");

const compareSchema = z.object({
  brand: z.string().trim().toLowerCase(),
  // One offer for the offer detail dialog, two for Offer VS.
  codes: z.array(z.string().trim().min(1)).min(1).max(2),
  // Same range as the table, so the curve adds up to its totals.
  range: z.object({ from: isoDate, to: isoDate }).nullable().default(null),
});

/** Daily sales of one offer (detail dialog) or the two picked offers (Offer VS). */
export const POST: RequestHandler = async (event) => {
  const { scope, body } = await requireExploreRequest(event, compareSchema);
  if (!scope.brands.some((brand) => brand.alias === body.brand)) {
    error(403, "Brand not in your scope");
  }
  return json(await getOfferDailyRows(body.brand, body.codes, body.range));
};
