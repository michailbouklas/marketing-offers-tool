import { error, fail } from "@sveltejs/kit";
import { message, setError, superValidate } from "sveltekit-superforms/server";
import { zod4 } from "sveltekit-superforms/adapters";
import { requirePermission } from "$lib/server/auth-guards";
import { recipeFormSchema } from "$lib/services/recipes";
import {
  getMenuItem,
  getRecipe,
  requireRecipeBrand,
  saveRecipe,
  validateRecipeLines,
} from "$lib/services/recipes.server";
import {
  listSapCompanies,
  resolveSapCompany,
} from "$lib/services/sap-items.server";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { recipe: ["manage"] });
  const { brand } = await requireRecipeBrand(event, event.params.brand);
  const itemCode = event.params.itemCode;

  const [menuItem, recipe, lockedCompany] = await Promise.all([
    getMenuItem(brand.alias, itemCode),
    getRecipe(brand.id, itemCode),
    resolveSapCompany(brand.sap_company_name),
  ]);
  // An item that left the menu stays editable while it still has a recipe.
  if (!menuItem && !recipe) error(404, "Menu item not found");

  const form = await superValidate(
    {
      lines: (recipe?.lines ?? []).map((line) => ({
        database_id: line.database_id,
        item_number: line.item_number,
        quantity: line.quantity,
      })),
    },
    zod4(recipeFormSchema),
    { errors: false },
  );

  return {
    brand,
    itemCode,
    menuItem,
    recipe,
    form,
    lockedCompany,
    companies: lockedCompany ? [] : await listSapCompanies(),
  };
};

export const actions: Actions = {
  save: async (event) => {
    const { user } = await requirePermission(event, { recipe: ["manage"] });
    const { brand } = await requireRecipeBrand(event, event.params.brand);
    const itemCode = event.params.itemCode;
    const form = await superValidate(event.request, zod4(recipeFormSchema));
    if (!form.valid) return fail(400, { form });

    const [menuItem, { errors, sapItems }] = await Promise.all([
      getMenuItem(brand.alias, itemCode),
      validateRecipeLines(brand, form.data.lines),
    ]);
    const existing = menuItem ? null : await getRecipe(brand.id, itemCode);
    if (!menuItem && !existing) error(404, "Menu item not found");

    for (const [index, text] of Object.entries(errors)) {
      setError(form, `lines[${Number(index)}].item_number`, text);
    }
    if (Object.keys(errors).length > 0) return fail(400, { form });

    await saveRecipe({
      brandId: brand.id,
      itemCode,
      itemDescription: menuItem?.description,
      userId: user!.id,
      lines: form.data.lines,
      sapItems,
    });

    return message(form, "Recipe saved");
  },
};
