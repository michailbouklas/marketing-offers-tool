import { error, fail } from "@sveltejs/kit";
import { message, superValidate } from "sveltekit-superforms/server";
import { zod4 } from "sveltekit-superforms/adapters";
import { requirePermission } from "$lib/server/auth-guards";
import {
  deleteItem,
  getCategory,
  listItems,
} from "$lib/server/inspiration/inspiration-storage.server";
import { getObjectStore } from "$lib/server/object-store.server";
import {
  deleteItemFormSchema,
  getDefaultDeleteItemFormData,
  type PromptGalleryActionMessage,
} from "$lib/services/inspiration/category-form";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { promptGallery: ["manage"] });

  const slug = event.params.slug;
  const store = getObjectStore();

  let category;
  try {
    category = await getCategory(store, slug);
  } catch {
    // Unsafe slug (traversal characters) — treat as not found.
    error(404, "Category not found");
  }

  if (!category) {
    error(404, "Category not found");
  }

  const [items, deleteItemForm] = await Promise.all([
    listItems(store, category.slug),
    superValidate(getDefaultDeleteItemFormData(), zod4(deleteItemFormSchema), {
      errors: false,
      id: "delete-item",
    }),
  ]);

  return {
    category,
    items: items.map((item) => ({
      ...item,
      imageUrl: item.image
        ? `/api/image-generator/inspiration/${category.slug}/${item.itemSlug}/image`
        : null,
    })),
    deleteItemForm,
  };
};

export const actions: Actions = {
  deleteItem: async (event) => {
    await requirePermission(event, { promptGallery: ["manage"] });

    const formData = await event.request.formData();
    const form = await superValidate(formData, zod4(deleteItemFormSchema), {
      id: "delete-item",
    });

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      await deleteItem(getObjectStore(), event.params.slug, form.data.itemSlug);
    } catch (error) {
      return message<PromptGalleryActionMessage>(
        form,
        {
          type: "error",
          text:
            error instanceof Error ? error.message : "Unable to delete item.",
        },
        { status: 400 },
      );
    }

    return message<PromptGalleryActionMessage>(form, {
      type: "success",
      text: "Item deleted.",
    });
  },
};
