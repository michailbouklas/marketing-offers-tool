import { error } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/auth-guards";
import { comboRange, withComboCosts } from "$lib/services/recipes";
import {
  listComboComponents,
  listMenuItems,
  listRecipeBrands,
  listRecipeCosts,
} from "$lib/services/recipes.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { recipe: ["manage"] });

  const brands = await listRecipeBrands(event);
  const requested = event.url.searchParams.get("brand");
  const brand = requested
    ? brands.find((candidate) => candidate.alias === requested)
    : brands[0];

  if (requested && !brand) error(404, "Brand not found");
  if (!brand) return { brands, brand: null, items: [] };

  const [menu, recipeCosts, combos] = await Promise.all([
    listMenuItems(brand.alias),
    listRecipeCosts(brand.id),
    listComboComponents(brand.alias, comboRange(new URLSearchParams())),
  ]);
  const costs = withComboCosts(recipeCosts, combos);

  return {
    brands,
    brand,
    items: menu.map((item) => ({
      ...item,
      recipe: costs.get(item.item_code) ?? null,
    })),
  };
};
