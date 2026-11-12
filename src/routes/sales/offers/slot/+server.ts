import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { isIsoDate } from "$lib/services/sales-dashboard";
import { requireExploreRequest } from "$lib/services/sales-explore.server";
import { getOfferSlotSales } from "$lib/services/sales-offers.server";
import type { RequestHandler } from "./$types";

const isoDate = z.string().refine(isIsoDate, "Invalid date");

const slotSchema = z.object({
  brand: z.string().trim().toLowerCase(),
  range: z.object({ from: isoDate, to: isoDate }),
  channels: z
    .array(z.string().trim().min(1).max(100))
    .min(1)
    .max(20)
    .optional(),
  // POS location ids (bound params; ids of another brand match nothing).
  locations: z
    .array(z.number().int().min(1).max(32_767))
    .min(1)
    .max(200)
    .optional(),
  // A date (By date), a weekday (Group by day) or a weekday × hour (hour grid).
  slot: z.union([
    z.object({ date: isoDate }).strict(),
    z
      .object({
        weekday: z.number().int().min(1).max(7),
        hour: z.number().int().min(0).max(23).optional(),
      })
      .strict(),
  ]),
});

/** Per-offer sales inside one offers-calendar cell. */
export const POST: RequestHandler = async (event) => {
  const { scope, body } = await requireExploreRequest(event, slotSchema);
  if (!scope.brands.some((brand) => brand.alias === body.brand)) {
    error(403, "Brand not in your scope");
  }
  return json(
    await getOfferSlotSales(
      body.brand,
      body.range,
      body.channels,
      body.slot,
      body.locations,
    ),
  );
};
