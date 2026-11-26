import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** The recipe grid moved to `/admin/recipes`; old links keep working. */
export const load: PageServerLoad = ({ url }) => {
  redirect(308, `/admin/recipes${url.search}`);
};
