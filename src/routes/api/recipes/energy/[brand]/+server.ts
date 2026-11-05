import { json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import { getEnergyCostPercent } from "$lib/services/energy.server";
import { requireRecipeBrand } from "$lib/services/recipes.server";
import type { RequestHandler } from "./$types";

/**
 * GET /api/recipes/energy/<alias> → { percent, from, to }
 *
 * Proxies the energy platform so its token stays on the server.
 */
export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, { recipe: ["manage"] });
  const { brand } = await requireRecipeBrand(event, event.params.brand);
  return json(await getEnergyCostPercent(brand.name));
};
