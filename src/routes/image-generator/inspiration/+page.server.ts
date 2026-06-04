import { requireAuthenticatedUser } from "$lib/server/auth-guards";
import { listCategories } from "$lib/server/inspiration/inspiration-storage.server";
import { getObjectStore } from "$lib/server/object-store.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  requireAuthenticatedUser(event);

  const categories = await listCategories(getObjectStore());

  return { categories };
};
