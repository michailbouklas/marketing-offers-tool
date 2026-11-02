import { error } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import {
  EXPLORE_COLUMNS_PREFERENCE,
  exploreColumnStateSchema,
} from "$lib/services/sales-explore";
import { setUserPreference } from "$lib/services/user-preferences.server";
import type { RequestHandler } from "./$types";

/** Saves the caller's grid column layout to user.meta. */
export const PUT: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, { sales: ["view"] });
  const parsed = exploreColumnStateSchema.safeParse(
    (await event.request.json().catch(() => null))?.columns,
  );
  if (!parsed.success) {
    error(400, parsed.error.issues[0]?.message ?? "Invalid column layout");
  }
  await setUserPreference(user.id, EXPLORE_COLUMNS_PREFERENCE, parsed.data);
  return new Response(null, { status: 204 });
};

/** Resets the layout to the default. */
export const DELETE: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, { sales: ["view"] });
  await setUserPreference(user.id, EXPLORE_COLUMNS_PREFERENCE, null);
  return new Response(null, { status: 204 });
};
