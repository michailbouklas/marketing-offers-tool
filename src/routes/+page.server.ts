import type { PageServerLoad } from "./$types";
import { getHomeOfferWidgets } from "$lib/services/home-offer-widgets";
import {
  getAuthenticatedUserRole,
  requireAuthenticatedUser,
} from "$lib/server/auth-guards";

export const load: PageServerLoad = async (event) => {
  requireAuthenticatedUser(event);

  return {
    userRole: await getAuthenticatedUserRole(event),
    widgets: await getHomeOfferWidgets(),
  };
};
