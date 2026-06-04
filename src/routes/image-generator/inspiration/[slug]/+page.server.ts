import { error } from "@sveltejs/kit";
import { requireAuthenticatedUser } from "$lib/server/auth-guards";
import {
  getCategory,
  listItems,
} from "$lib/server/inspiration/inspiration-storage.server";
import { getObjectStore } from "$lib/server/object-store.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  requireAuthenticatedUser(event);

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

  const items = await listItems(store, category.slug);

  return {
    category,
    items: items.map((item) => ({
      ...item,
      imageUrl: item.image
        ? `/api/image-generator/inspiration/${category.slug}/${item.itemSlug}/image`
        : null,
    })),
  };
};
