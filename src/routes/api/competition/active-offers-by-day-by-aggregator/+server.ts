import { requireApiPermission } from "$lib/server/auth-guards";
import { getActiveOffersByDayByAggregator } from "$lib/services/competition/active-offers-timeseries.server";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, { competition: ["view"] });

  return json(await getActiveOffersByDayByAggregator());
};
