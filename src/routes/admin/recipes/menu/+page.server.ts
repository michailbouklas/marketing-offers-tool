import { error, fail } from "@sveltejs/kit";
import { message, superValidate } from "sveltekit-superforms/server";
import { zod4 } from "sveltekit-superforms/adapters";
import { requirePermission } from "$lib/server/auth-guards";
import { menuBulkSchema } from "$lib/services/menu";
import {
  deleteMenuItems,
  listBrandMenu,
  setMenuItemsActive,
} from "$lib/services/menu.server";
import {
  listRecipeBrands,
  requireRecipeBrand,
} from "$lib/services/recipes.server";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { recipe: ["manage"] });
  const brands = await listRecipeBrands(event);
  const requested = event.url.searchParams.get("brand");
  const brand = requested
    ? brands.find((candidate) => candidate.alias === requested)
    : brands[0];
  if (requested && !brand) error(404, "Brand not found");

  const bulkForm = await superValidate(zod4(menuBulkSchema));
  if (!brand) return { brands, brand: null, rows: [], bulkForm };
  const { rows } = await listBrandMenu(brand);
  return { brands, brand, rows, bulkForm };
};

export const actions: Actions = {
  bulk: async (event) => {
    const { user } = await requirePermission(event, { recipe: ["manage"] });
    const { brand } = await requireRecipeBrand(
      event,
      event.url.searchParams.get("brand") ?? "",
    );
    const form = await superValidate(event.request, zod4(menuBulkSchema));
    if (!form.valid) return fail(400, { form });

    const { action, ids } = form.data;
    if (action === "delete") {
      const count = await deleteMenuItems(brand.id, ids);
      return message(
        form,
        `Deleted ${count} menu item${count === 1 ? "" : "s"}`,
      );
    }
    const count = await setMenuItemsActive(
      brand.id,
      ids,
      action === "activate",
      user!.id,
    );
    return message(
      form,
      `${action === "activate" ? "Activated" : "Disabled"} ${count} menu item${count === 1 ? "" : "s"}`,
    );
  },
};
