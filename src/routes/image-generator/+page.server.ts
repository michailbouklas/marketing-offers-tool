import { requireAuthenticatedUser } from "$lib/server/auth-guards";
import { listBrandsForUser } from "$lib/services/brands.server";
import {
  listPresetsForUser,
  listTemplatesForUser,
} from "$lib/services/image-generator/composer-library.server";
import { buildImageGeneratorConfig } from "$lib/services/image-providers/config.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { user } = requireAuthenticatedUser(event);

  const [config, brands, presets, templates] = await Promise.all([
    buildImageGeneratorConfig(),
    listBrandsForUser(user!.id, { active: true }),
    listPresetsForUser(user!.id),
    listTemplatesForUser(user!.id),
  ]);

  // The composer starts empty on every load — prior generations live at
  // /image-generator/me, not in the live composer grid.
  return { config, images: [], brands, presets, templates };
};
