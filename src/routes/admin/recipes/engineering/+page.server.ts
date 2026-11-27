import { error } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/auth-guards";
import { exVatPrice, menuEngineeringScope } from "$lib/services/recipes";
import {
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

  const [allMenu, costs] = await Promise.all([
    listMenuItems(brand.alias),
    listRecipeCosts(brand.id),
  ]);
  // Engineering covers what is on sale now; inactive items would all be Dogs.
  const menu = allMenu.filter((item) => item.active);

  const sales = await listItemSales(
    brand.alias,
    menu.map((item) => item.item_code),
    days,
  );
  const { rated, unsold, zeroPrice } = menuEngineeringScope(menu, sales);

  // Every rated item gets a popularity class; only a complete recipe gives a
  // margin (a partial cost would overstate CM and skew the average).
  const items = rated.map((item) => {
    const recipe = costs.get(item.item_code);
    const cost = recipe && recipe.missing === 0 ? recipe.total : null;
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
    // Rated items without a margin (popularity only), by reason.
    unrated: {
      noRecipe: rated.filter((item) => !costs.has(item.item_code)).length,
      incomplete: rated.filter(
        (item) => (costs.get(item.item_code)?.missing ?? 0) > 0,
      ).length,
    },
    // Active items left out of the rating.
    excluded: { zeroPrice, unsold: unsold.length },
    unsold: unsold.map((item) => ({
      item_code: item.item_code,
      description: item.description,
      category: item.category,
      price: item.price,
    })),
  };
};
