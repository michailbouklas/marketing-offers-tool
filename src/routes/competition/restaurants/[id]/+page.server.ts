import { requirePermission } from "$lib/server/auth-guards";
import { getRestaurantDetail } from "$lib/services/competition/restaurants.server";
import { error } from "@sveltejs/kit";
import { z } from "zod";
import type { PageServerLoad } from "./$types";

const idSchema = z.coerce.number().int().positive();

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { competition: ["view"] });

  const restaurantId = idSchema.safeParse(event.params.id);
  const processorId = idSchema.safeParse(
    event.url.searchParams.get("processor"),
  );

  if (!restaurantId.success || !processorId.success) {
    error(404, "Restaurant not found");
  }

  const detail = await getRestaurantDetail(processorId.data, restaurantId.data);

  if (!detail) {
    error(404, "Restaurant not found");
  }

  return { detail };
};
