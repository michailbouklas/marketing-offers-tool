import { redirect } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms";
import { zod4 } from "sveltekit-superforms/adapters";
import { loginSchema } from "./schema.js";

export const load = async ({ locals }) => {
  if (locals.session) {
    redirect(302, "/");
  }

  return {
    form: await superValidate(zod4(loginSchema)),
  };
};
