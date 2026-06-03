import { requireAuthenticatedUser } from "$lib/server/auth-guards";
import { listBrandsForUser } from "$lib/services/brands.server";
import { buildImageGeneratorConfig } from "$lib/services/image-providers/config.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { user } = requireAuthenticatedUser(event);

  const [config, brands] = await Promise.all([
    buildImageGeneratorConfig(),
    listBrandsForUser(user!.id, { active: true }),
  ]);

  // The composer starts empty on every load — prior generations live at
  // /image-generator/me, not in the live composer grid.
  return { config, images: [], brands };
};
