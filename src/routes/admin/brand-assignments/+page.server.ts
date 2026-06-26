import { requirePermission } from "$lib/server/auth-guards";
import { listBrandAssignments } from "$lib/services/brand-entities.server";
import { listBrands } from "$lib/services/brands.server";
import type { PageServerLoad } from "./$types";

/**
 * Brand-assignment admin tool: group scraped entities (competition restaurants
 * and Google reviews businesses) under a brand. Gated on `brand: ["manage"]`,
 * so `superUser`, `brandManager`, and `admin` may reach it.
 *
 * Only the gated `load` exists for now — the interactive UI (`+page.svelte`) is
 * a follow-up. Mutations are served by `/api/admin/brand-entities`.
 */
export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { brand: ["manage"] });

  const [brands, assignments] = await Promise.all([
    listBrands(),
    listBrandAssignments(),
  ]);

  return { brands, assignments };
};
