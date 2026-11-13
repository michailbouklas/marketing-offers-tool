import { error } from "@sveltejs/kit";
import {
  getAuthenticatedUserRole,
  requireAuthenticatedApiUser,
} from "$lib/server/auth-guards";
import {
  DASHBOARD_LAYOUT_PREFERENCE,
  dashboardLayoutSchema,
  normalizeLayout,
} from "$lib/dashboard/widgets";
import { setUserPreference } from "$lib/services/user-preferences.server";
import type { RequestHandler } from "./$types";

/** Saves the caller's home dashboard; widgets their roles cannot see are dropped. */
export const PUT: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);
  const parsed = dashboardLayoutSchema.safeParse(
    await event.request.json().catch(() => null),
  );
  if (!parsed.success) {
    error(400, parsed.error.issues[0]?.message ?? "Invalid dashboard layout");
  }
  const widgets = normalizeLayout(
    parsed.data,
    await getAuthenticatedUserRole(event),
  );
  await setUserPreference(user.id, DASHBOARD_LAYOUT_PREFERENCE, { widgets });
  return new Response(null, { status: 204 });
};

/** Resets to the default layout for the caller's roles. */
export const DELETE: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);
  await setUserPreference(user.id, DASHBOARD_LAYOUT_PREFERENCE, null);
  return new Response(null, { status: 204 });
};
