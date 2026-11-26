import { error, fail, redirect, type RequestEvent } from "@sveltejs/kit";
import { message, setError, superValidate } from "sveltekit-superforms/server";
import { zod4 } from "sveltekit-superforms/adapters";
import { requirePermission } from "$lib/server/auth-guards";
import {
  mergeStoredLines,
  recipeFormSchema,
  recipeHref,
} from "$lib/services/recipes";
import {
  getMenuItem,
  getRecipe,
  getRecipeById,
  requireRecipeBrand,
  saveRecipe,
  validateRecipeLines,
  type RecipeBrand,
} from "$lib/services/recipes.server";
import {
  listSapCompanies,
  resolveSapCompany,
} from "$lib/services/sap-items.server";
import type { Actions, PageServerLoad } from "./$types";

/**
 * What `:id` points at: a stored recipe (by id, linked to a POS item or not),
 * or with `new?item=<POS code>` the POS item a recipe is being built for.
 * 404 for anything else, including a recipe of another brand.
 */
async function resolveTarget(event: RequestEvent, brand: RecipeBrand) {
  if (event.params.id === "new") {
    const itemCode = event.url.searchParams.get("item") ?? "";
    const [menuItem, recipe] = await Promise.all([
      itemCode ? getMenuItem(brand.alias, itemCode) : null,
      itemCode ? getRecipe(brand.id, itemCode) : null,
    ]);
    if (!menuItem && !recipe) error(404, "Menu item not found");
    return { itemCode, menuItem, recipe };
  }

  const id = Number(event.params.id);
  const recipe = Number.isInteger(id) ? await getRecipeById(id) : null;
  if (!recipe || recipe.brandId !== brand.id) error(404, "Recipe not found");
  const itemCode = recipe.item_code;
  // An item that left the menu stays editable while it still has a recipe.
  const menuItem = itemCode ? await getMenuItem(brand.alias, itemCode) : null;
  return { itemCode, menuItem, recipe };
}

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { recipe: ["manage"] });
  const { brand } = await requireRecipeBrand(event, event.params.brand);
  const { itemCode, menuItem, recipe } = await resolveTarget(event, brand);
  // Pages that only know a POS code link to `new?item=`: land on the recipe.
  if (event.params.id === "new" && recipe) {
    redirect(307, recipeHref(brand.alias, { id: recipe.id }));
  }

  const lockedCompany = await resolveSapCompany(brand.sap_company_name);

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
    const form = await superValidate(event.request, zod4(recipeFormSchema));
    if (!form.valid) return fail(400, { form });

    const [{ itemCode, menuItem, recipe }, sap] = await Promise.all([
      resolveTarget(event, brand),
      validateRecipeLines(brand, form.data.lines),
    ]);
    const merged = mergeStoredLines(form.data.lines, recipe?.lines ?? []);
    const errors = { ...merged.errors, ...sap.errors };
    for (const [index, text] of Object.entries(errors)) {
      setError(form, `lines[${Number(index)}].item_number`, text);
    }
    if (Object.keys(errors).length > 0) return fail(400, { form });

    const id = await saveRecipe({
      brandId: brand.id,
      recipeId: recipe?.id ?? null,
      itemCode,
      importName: recipe?.import_name ?? undefined,
      itemDescription: menuItem?.description,
      userId: user!.id,
      lines: merged.lines,
      sapItems: sap.sapItems,
    });

    // First save of a POS item's recipe: continue on the recipe's own URL.
    if (event.params.id === "new") {
      redirect(303, recipeHref(brand.alias, { id }));
    }
    return message(form, "Recipe saved");
  },
};
