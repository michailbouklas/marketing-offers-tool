import { requirePermission } from "$lib/server/auth-guards";
import { comboRange, costCombo } from "$lib/services/recipes";
import {
  listComboComponents,
  listCombos,
  listMenuItems,
  listRecipeCosts,
  requireRecipeBrand,
} from "$lib/services/recipes.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { recipe: ["manage"] });
  const { brand, brands } = await requireRecipeBrand(event, event.params.brand);
  const range = comboRange(event.url.searchParams);

  const [combos, components, menu, costs] = await Promise.all([
    listCombos(brand.alias, range),
    listComboComponents(brand.alias, range),
    listMenuItems(brand.alias),
    listRecipeCosts(brand.id),
  ]);
  const menuByCode = new Map(menu.map((item) => [item.item_code, item]));

  return {
    brands,
    brand,
    range,
    combos: combos.map((combo) => {
      const item = menuByCode.get(combo.code);
      return {
        ...combo,
        description: item?.description ?? "",
        category: item?.category ?? "",
        price: item?.price ?? null,
        onMenu: Boolean(item),
        // An own recipe wins, as on the recipes list.
        cost:
          costs.get(combo.code) ??
          costCombo(components.get(combo.code) ?? [], costs),
      };
    }),
  };
};
