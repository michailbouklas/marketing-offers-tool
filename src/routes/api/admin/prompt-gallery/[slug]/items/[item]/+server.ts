import { error, json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import {
  getItem,
  updateItem,
} from "$lib/server/inspiration/inspiration-storage.server";
import { getObjectStore } from "$lib/server/object-store.server";
import { extensionForContentType } from "$lib/server/reference-storage";
import type { RequestHandler } from "./$types";

export const PUT: RequestHandler = async (event) => {
  await requireApiPermission(event, { promptGallery: ["manage"] });

  const { slug, item: itemSlug } = event.params;
  const store = getObjectStore();

  let existing;
  try {
    existing = await getItem(store, slug, itemSlug);
  } catch {
    error(400, "Invalid item slug");
  }
  if (!existing) {
    error(404, "Item not found");
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

  // The replacement image is optional on edit.
  const newFile = file instanceof File && file.size > 0 ? file : undefined;
  if (newFile && !extensionForContentType(newFile.type)) {
    error(400, `Unsupported image content type: ${newFile.type || "<empty>"}`);
  }

  const item = await updateItem(store, slug, existing.itemSlug, {
    title,
    prompt,
    file: newFile,
  });

  return json({ itemSlug: item.itemSlug });
};
