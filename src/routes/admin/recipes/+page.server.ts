import { error } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/auth-guards";
import {
  RECIPES_COLUMNS_PREFERENCE,
  recipeColumnStateSchema,
} from "$lib/services/recipes";
import { listRecipeBrands, listRecipeRows } from "$lib/services/recipes.server";
import { getUserPreference } from "$lib/services/user-preferences.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { user } = await requirePermission(event, { recipe: ["manage"] });

  const [brands, savedColumns] = await Promise.all([
    listRecipeBrands(event),
    getUserPreference(user!.id, RECIPES_COLUMNS_PREFERENCE),
  ]);
  // A stale or hand-edited layout is ignored rather than breaking the grid.
  const columns = recipeColumnStateSchema.safeParse(savedColumns);
  const columnState = columns.success ? columns.data : null;

  const requested = event.url.searchParams.get("brand");
  const brand = requested
    ? brands.find((candidate) => candidate.alias === requested)
    : brands[0];

  if (requested && !brand) error(404, "Brand not found");
  if (!brand) return { brands, brand: null, rows: [], columnState };

  return { brands, brand, rows: await listRecipeRows(brand), columnState };
};
