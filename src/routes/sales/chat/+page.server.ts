import { requirePermission } from "$lib/server/auth-guards";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { sales: ["view"] });
};
