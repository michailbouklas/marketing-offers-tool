import { error, fail, redirect, type RequestEvent } from "@sveltejs/kit";
import { message, setError, superValidate } from "sveltekit-superforms/server";
import { zod4 } from "sveltekit-superforms/adapters";
import { requirePermission } from "$lib/server/auth-guards";
import { menuItemFormSchema, type MenuSize } from "$lib/services/menu";
import {
  getMenuItem,
  listRecipeOptions,
  saveMenuItem,
} from "$lib/services/menu.server";
import type { MaterialInfo } from "$lib/services/menu";
import { requireRecipeBrand } from "$lib/services/recipes.server";
import type { Actions, PageServerLoad } from "./$types";

/** `:id` = a menu item of this brand, or `new`; 404 otherwise. */
async function resolveItem(event: RequestEvent, brandId: number) {
  if (event.params.id === "new") return null;
  const id = Number(event.params.id);
  const item = Number.isInteger(id) ? await getMenuItem(brandId, id) : null;
  if (!item) error(404, "Menu item not found");
  return item;
}

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { recipe: ["manage"] });
  const { brand } = await requireRecipeBrand(event, event.params.brand ?? "");
  const [item, recipes] = await Promise.all([
    resolveItem(event, brand.id),
    listRecipeOptions(brand),
  ]);

  const form = await superValidate(
    item
      ? {
          name: item.name,
          category: item.category,
          lto: item.lto,
          meal: item.meal,
          size: item.size as MenuSize | null,
          active: item.active,
          price: item.price === null ? null : Number(item.price),
          // Deleted recipes (no recipe, no material) are shown apart and dropped.
          lines: item.lines.flatMap((line) =>
            line.recipeId === null && line.item_number === null
              ? []
              : [
                  {
                    recipeId: line.recipeId,
                    database_id: line.database_id,
                    item_number: line.item_number,
                    quantity: Number(line.quantity),
                  },
                ],
          ),
        }
      : undefined,
    zod4(menuItemFormSchema),
    { errors: false },
  );

  // SAP rows of the stored material lines; a material SAP no longer knows
  // keeps its saved description and unit (and no cost).
  const materials: Record<string, MaterialInfo> = {};
  for (const line of item?.lines ?? []) {
    if (!line.item_number) continue;
    const key = `${line.database_id}|${line.item_number}`;
    const sap = item!.materials.get(key);
    materials[key] = {
      item_number: line.item_number,
      item_description: sap?.item_description ?? line.name,
      purchasing_uom: sap?.purchasing_uom ?? line.uom,
      item_cost: sap?.item_cost ?? null,
    };
  }

  return {
    brand,
    id: item?.id ?? null,
    form,
    recipes,
    materials,
    deletedLines: (item?.lines ?? [])
      .filter((line) => line.recipeId === null && line.item_number === null)
      .map((line) => line.name),
  };
};

export const actions: Actions = {
  save: async (event) => {
    const { user } = await requirePermission(event, { recipe: ["manage"] });
    const { brand } = await requireRecipeBrand(event, event.params.brand ?? "");
    const form = await superValidate(event.request, zod4(menuItemFormSchema));
    if (!form.valid) return fail(400, { form });

    const item = await resolveItem(event, brand.id);
    const result = await saveMenuItem({
      brand,
      id: item?.id ?? null,
      userId: user!.id,
      data: form.data,
    });
    if ("error" in result) return setError(form, result.field, result.error);

    if (!item) {
      redirect(
        303,
        `/admin/recipes/menu/${encodeURIComponent(brand.alias)}/${result.id}`,
      );
    }
    return message(form, "Menu item saved");
  },
};
