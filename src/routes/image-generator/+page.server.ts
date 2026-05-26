import { requireAuthenticatedUser } from "$lib/server/auth-guards";
import { buildImageGeneratorConfig } from "$lib/services/image-providers/config.server";
import { listGeneratedImagesForUser } from "$lib/services/image-generator/image-generator.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { user } = requireAuthenticatedUser(event);

  const [config, images] = await Promise.all([
    Promise.resolve(buildImageGeneratorConfig()),
    listGeneratedImagesForUser(user!.id, { limit: 50 }),
  ]);

  return { config, images };
};
