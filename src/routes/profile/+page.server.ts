import { redirect } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms";
import { zod4 } from "sveltekit-superforms/adapters";
import { listBrandsForUser } from "$lib/services/brands.server";
import { profileSchema, passwordSchema } from "./schema.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    redirect(302, "/login");
  }

  const brands = await listBrandsForUser(locals.user.id);

  return {
    profileForm: await superValidate(
      { name: locals.user.name ?? "" },
      zod4(profileSchema),
    ),
    passwordForm: await superValidate(zod4(passwordSchema)),
    brands,
  };
};
