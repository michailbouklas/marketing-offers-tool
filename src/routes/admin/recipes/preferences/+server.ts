import { error } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import {
  RECIPES_COLUMNS_PREFERENCE,
  recipeColumnStateSchema,
} from "$lib/services/recipes";
import { setUserPreference } from "$lib/services/user-preferences.server";
import type { RequestHandler } from "./$types";

/** Saves the caller's recipe grid column layout to user.meta. */
export const PUT: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, { recipe: ["manage"] });
  const parsed = recipeColumnStateSchema.safeParse(
    (await event.request.json().catch(() => null))?.columns,
  );
  if (!parsed.success) {
    error(400, parsed.error.issues[0]?.message ?? "Invalid column layout");
  }
  await setUserPreference(user.id, RECIPES_COLUMNS_PREFERENCE, parsed.data);
  return new Response(null, { status: 204 });
};

/** Resets the layout to the default. */
export const DELETE: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, { recipe: ["manage"] });
  await setUserPreference(user.id, RECIPES_COLUMNS_PREFERENCE, null);
  return new Response(null, { status: 204 });
};
