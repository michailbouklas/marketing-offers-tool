import { requirePermission } from "$lib/server/auth-guards";
import { getDashboardStats } from "$lib/services/google-reviews/dashboard.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { googleReviews: ["view"] });

  return {
    stats: await getDashboardStats(),
  };
};
