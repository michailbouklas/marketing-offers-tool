import { json } from "@sveltejs/kit";
import { requireAuthenticatedUser } from "$lib/server/auth-guards";
import { listPricingSubcategoriesByCategoryId } from "$lib/services/offers-data-quality-postgres.server";
import { categorySearchParamsSchema } from "$lib/services/offers-data-quality";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  requireAuthenticatedUser(event);

  const parseResult = categorySearchParamsSchema.safeParse({
    category_id: event.url.searchParams.get("category_id"),
  });

  if (!parseResult.success) {
    return json(
      {
        errors: {
          category_id: "A valid category_id is required",
        },
      },
      { status: 400 },
    );
  }

  const subcategories = await listPricingSubcategoriesByCategoryId(
    parseResult.data.category_id,
  );

  return json(subcategories);
};
