import { requirePermission } from "$lib/server/auth-guards";
import { listBrands } from "$lib/services/brands.server";
import {
  createCompanyFormSchema,
  deleteCompanyFormSchema,
  editCompanyFormSchema,
} from "$lib/services/companies";
import {
  createCompany,
  deleteCompany,
  listCompaniesAdmin,
  updateCompany,
} from "$lib/services/companies.server";
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

// Plain FormData + Zod, as on energy-platform: one small form per row/dialog.
function values(form: FormData) {
  return {
    name: String(form.get("name") ?? ""),
    registrationNumber: String(form.get("registrationNumber") ?? ""),
    vatNumber: String(form.get("vatNumber") ?? ""),
    sapDatabaseId: String(form.get("sapDatabaseId") ?? ""),
    active: form.get("active") === "on",
    brandIds: form.getAll("brandIds").map(String),
  };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { brand: ["manage"] });
  // All brands, not only active ones: saving would otherwise unlink an inactive brand.
  const [companies, brands] = await Promise.all([
    listCompaniesAdmin(),
    listBrands(),
  ]);
  return { companies, brands };
};

export const actions: Actions = {
  createCompany: async (event) => {
    await requirePermission(event, { brand: ["manage"] });
    const parsed = createCompanyFormSchema.safeParse(
      values(await event.request.formData()),
    );
    if (!parsed.success)
      return fail(400, { error: parsed.error.issues[0]?.message });
    try {
      await createCompany(parsed.data);
      return { success: true };
    } catch (error) {
      return fail(400, {
        error: errorMessage(error, "Could not create company."),
      });
    }
  },
  updateCompany: async (event) => {
    await requirePermission(event, { brand: ["manage"] });
    const form = await event.request.formData();
    const parsed = editCompanyFormSchema.safeParse({
      ...values(form),
      id: String(form.get("id") ?? ""),
    });
    if (!parsed.success)
      return fail(400, { error: parsed.error.issues[0]?.message });
    try {
      await updateCompany(parsed.data.id, parsed.data);
      return { success: true };
    } catch (error) {
      return fail(400, {
        error: errorMessage(error, "Could not update company."),
      });
    }
  },
  deleteCompany: async (event) => {
    await requirePermission(event, { brand: ["manage"] });
    const form = await event.request.formData();
    const parsed = deleteCompanyFormSchema.safeParse({
      id: String(form.get("id") ?? ""),
    });
    if (!parsed.success)
      return fail(400, { error: parsed.error.issues[0]?.message });
    try {
      await deleteCompany(parsed.data.id);
      return { success: true };
    } catch (error) {
      return fail(400, {
        error: errorMessage(error, "Could not delete company."),
      });
    }
  },
};
