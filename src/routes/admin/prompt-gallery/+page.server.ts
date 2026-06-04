import { fail } from "@sveltejs/kit";
import { message, superValidate } from "sveltekit-superforms/server";
import { zod4 } from "sveltekit-superforms/adapters";
import { requirePermission } from "$lib/server/auth-guards";
import {
  createCategory,
  deleteCategory,
  listCategories,
  renameCategory,
} from "$lib/server/inspiration/inspiration-storage.server";
import { getObjectStore } from "$lib/server/object-store.server";
import {
  createCategoryFormSchema,
  deleteCategoryFormSchema,
  getDefaultCreateCategoryFormData,
  getDefaultDeleteCategoryFormData,
  getDefaultRenameCategoryFormData,
  renameCategoryFormSchema,
  type PromptGalleryActionMessage,
} from "$lib/services/inspiration/category-form";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  // /admin hooks gate enforces the admin section; this additionally requires
  // the prompt-gallery capability (superUser or brandManager).
  await requirePermission(event, { promptGallery: ["manage"] });

  const [categories, createForm, renameForm, deleteForm] = await Promise.all([
    listCategories(getObjectStore()),
    superValidate(
      getDefaultCreateCategoryFormData(),
      zod4(createCategoryFormSchema),
      { errors: false, id: "create-category" },
    ),
    superValidate(
      getDefaultRenameCategoryFormData(),
      zod4(renameCategoryFormSchema),
      { errors: false, id: "rename-category" },
    ),
    superValidate(
      getDefaultDeleteCategoryFormData(),
      zod4(deleteCategoryFormSchema),
      { errors: false, id: "delete-category" },
    ),
  ]);

  return { categories, createForm, renameForm, deleteForm };
};

export const actions: Actions = {
  createCategory: async (event) => {
    await requirePermission(event, { promptGallery: ["manage"] });

    const formData = await event.request.formData();
    const form = await superValidate(formData, zod4(createCategoryFormSchema), {
      id: "create-category",
    });

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      await createCategory(getObjectStore(), form.data.name);
    } catch (error) {
      return message<PromptGalleryActionMessage>(
        form,
        {
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Unable to create category.",
        },
        { status: 400 },
      );
    }

    return message<PromptGalleryActionMessage>(form, {
      type: "success",
      text: "Category created.",
    });
  },

  renameCategory: async (event) => {
    await requirePermission(event, { promptGallery: ["manage"] });

    const formData = await event.request.formData();
    const form = await superValidate(formData, zod4(renameCategoryFormSchema), {
      id: "rename-category",
    });

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      await renameCategory(getObjectStore(), form.data.slug, form.data.name);
    } catch (error) {
      return message<PromptGalleryActionMessage>(
        form,
        {
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Unable to rename category.",
        },
        { status: 400 },
      );
    }

    return message<PromptGalleryActionMessage>(form, {
      type: "success",
      text: "Category renamed.",
    });
  },

  deleteCategory: async (event) => {
    await requirePermission(event, { promptGallery: ["manage"] });

    const formData = await event.request.formData();
    const form = await superValidate(formData, zod4(deleteCategoryFormSchema), {
      id: "delete-category",
    });

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      await deleteCategory(getObjectStore(), form.data.slug);
    } catch (error) {
      return message<PromptGalleryActionMessage>(
        form,
        {
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Unable to delete category.",
        },
        { status: 400 },
      );
    }

    return message<PromptGalleryActionMessage>(form, {
      type: "success",
      text: "Category deleted.",
    });
  },
};
