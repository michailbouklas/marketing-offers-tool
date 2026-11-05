import { error } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/auth-guards";
import { comboRange, exVatPrice, withComboCosts } from "$lib/services/recipes";
import {
  listComboComponents,
  listItemSales,
  listMenuItems,
  listRecipeBrands,
  listRecipeCosts,
} from "$lib/services/recipes.server";
import type { PageServerLoad } from "./$types";

const PERIODS = [30, 90, 365] as const;

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { recipe: ["manage"] });

  const brands = await listRecipeBrands(event);
  const requested = event.url.searchParams.get("brand");
  const brand = requested
    ? brands.find((candidate) => candidate.alias === requested)
    : brands[0];
  if (!brand) error(404, "Brand not found");

  const daysParam = Number(event.url.searchParams.get("days") ?? 90);
  const days = PERIODS.find((period) => period === daysParam) ?? 90;

  const [allMenu, recipeCosts, combos] = await Promise.all([
    listMenuItems(brand.alias),
    listRecipeCosts(brand.id),
    listComboComponents(brand.alias, comboRange(new URLSearchParams())),
  ]);
  const costs = withComboCosts(recipeCosts, combos);
  // Engineering covers what is on sale now; inactive items would all be Dogs.
  const menu = allMenu.filter((item) => item.active);

  const sales = await listItemSales(
    brand.alias,
    menu.map((item) => item.item_code),
    days,
  );

  // Every item is rated on popularity; only a complete recipe and a price give
  // a margin (a partial cost would overstate CM and skew the average).
  const items = menu.map((item) => {
    const recipe = costs.get(item.item_code);
    const cost =
      recipe && recipe.missing === 0 && item.price > 0 ? recipe.total : null;
    const sold = sales.get(item.item_code);
    return {
      item_code: item.item_code,
      description: item.description,
      category: item.category,
      active: item.active,
      price: item.price,
      cost,
      // Contribution margin per unit, on the ex-VAT list price.
      cm: cost === null ? null : exVatPrice(item.price) - cost,
      units: sold?.units ?? 0,
      net: sold?.net ?? 0,
    };
  });

  return {
    brands,
    brand,
    days,
    periods: PERIODS,
    items,
    // Items rated on sales only (no margin), by reason.
    unrated: {
      noRecipe: menu.filter((item) => !costs.has(item.item_code)).length,
      incomplete: menu.filter((item) => {
        const recipe = costs.get(item.item_code);
        return recipe && (recipe.missing > 0 || item.price <= 0);
      }).length,
    },
  };
};
