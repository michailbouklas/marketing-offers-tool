import { error } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/auth-guards";
import { comboRange, costComboDetail } from "$lib/services/recipes";
import {
  getMenuItem,
  listComboComponents,
  listCombos,
  listRecipeCosts,
  requireRecipeBrand,
} from "$lib/services/recipes.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { recipe: ["manage"] });
  const { brand } = await requireRecipeBrand(event, event.params.brand);
  const code = event.params.comboCode;
  const range = comboRange(event.url.searchParams);

  const [combos, components, menuItem, costs] = await Promise.all([
    listCombos(brand.alias, range),
    listComboComponents(brand.alias, range, code),
    getMenuItem(brand.alias, code),
    listRecipeCosts(brand.id),
  ]);
  const combo = combos.find((candidate) => candidate.code === code);
  if (!combo) error(404, "Not a combo in this period");

  return {
    brand,
    range,
    combo,
    menuItem,
    ownRecipe: costs.get(code) ?? null,
    detail: costComboDetail(components.get(code) ?? [], costs),
  };
};
