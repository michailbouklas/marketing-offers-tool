import { requirePermission } from "$lib/server/auth-guards";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  // The /admin hooks gate already enforces an admin-section role; this
  // additionally requires the Google Reviews manage capability.
  await requirePermission(event, { googleReviews: ["manage"] });

  return {};
};
