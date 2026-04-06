import { getAuthenticatedUserRole } from "$lib/server/auth-guards";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async (event) => {
  if (!event.locals.user) {
    return {
      user: null,
    };
  }

  await getAuthenticatedUserRole(event);

  return {
    user: event.locals.user,
  };
};
