import { requireAuthenticatedUser } from "$lib/server/auth-guards";
import { listBrandsForUser } from "$lib/services/brands.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { user } = requireAuthenticatedUser(event);

  const brands = await listBrandsForUser(user!.id, { active: true });

  return { brands };
};
