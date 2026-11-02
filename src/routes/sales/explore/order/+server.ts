import { error, json } from "@sveltejs/kit";
import {
  queryExploreOrder,
  requireExploreRequest,
} from "$lib/services/sales-explore.server";
import type { RequestHandler } from "./$types";

/** Full order + lines. Uses all scoped brands, not the URL brand subset. */
export const GET: RequestHandler = async (event) => {
  const { scope } = await requireExploreRequest(event);
  const order = await queryExploreOrder(
    scope.brands.map((brand) => brand.alias),
    event.url.searchParams.get("pk") ?? "",
  );
  if (!order) {
    error(404, "Order not found");
  }
  return json(order);
};
