import { error, json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import { getRecipeById, listRecipeBrands } from "$lib/services/recipes.server";
import type { RequestHandler } from "./$types";

/** Lines of one recipe with their live SAP rows, for the breakdown dialog. */
export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, { recipe: ["manage"] });

  const id = Number(event.params.id);
  const [recipe, brands] = await Promise.all([
    Number.isInteger(id) ? getRecipeById(id) : null,
    listRecipeBrands(event),
  ]);
  // A recipe of a brand the user may not see answers like a missing one.
  if (!recipe || !brands.some((brand) => brand.id === recipe.brandId)) {
    error(404, "Recipe not found");
  }

  return json({ lines: recipe.lines });
};
