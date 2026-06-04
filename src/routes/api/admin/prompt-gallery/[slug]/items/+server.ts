import { error, json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import {
  createItem,
  getCategory,
} from "$lib/server/inspiration/inspiration-storage.server";
import { getObjectStore } from "$lib/server/object-store.server";
import { extensionForContentType } from "$lib/server/reference-storage";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  await requireApiPermission(event, { promptGallery: ["manage"] });

  const slug = event.params.slug;
  const store = getObjectStore();

  let category;
  try {
    category = await getCategory(store, slug);
  } catch {
    error(400, "Invalid category slug");
  }
  if (!category) {
    error(404, "Category not found");
  }

  let form: FormData;
  try {
    form = await event.request.formData();
  } catch {
    error(400, "Expected multipart/form-data body");
  }

  const title = form.get("title");
  const prompt = form.get("prompt");
  const file = form.get("file");

  if (typeof title !== "string" || !title.trim()) {
    error(400, "title is required");
  }
  if (typeof prompt !== "string" || !prompt.trim()) {
    error(400, "prompt is required");
  }
  if (!(file instanceof File) || file.size === 0) {
    error(400, "An image file is required");
  }
  if (!extensionForContentType(file.type)) {
    error(400, `Unsupported image content type: ${file.type || "<empty>"}`);
  }

  const item = await createItem(store, category.slug, {
    title,
    prompt,
    file,
  });

  return json({ itemSlug: item.itemSlug }, { status: 201 });
};
