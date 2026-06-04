import { error } from "@sveltejs/kit";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import {
  getItem,
  inspirationImageKey,
} from "$lib/server/inspiration/inspiration-storage.server";
import { getObjectStore } from "$lib/server/object-store.server";
import type { RequestHandler } from "./$types";

const EXTENSION_TO_CONTENT_TYPE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export const GET: RequestHandler = async (event) => {
  requireAuthenticatedApiUser(event);

  const { slug, item: itemSlug } = event.params;
  const store = getObjectStore();

  let item;
  try {
    item = await getItem(store, slug, itemSlug);
  } catch {
    // Unsafe slug (traversal characters) — treat as not found.
    error(404, "Not found");
  }

  // The image filename comes from the stored item metadata, never from the
  // request, so the client cannot address arbitrary keys.
  if (!item?.image) {
    error(404, "Not found");
  }

  const bytes = await store.tryGet(inspirationImageKey(slug, item.image));
  if (!bytes) {
    error(404, "Not found");
  }

  const ext = item.image.split(".").pop()?.toLowerCase() ?? "png";
  const contentType = EXTENSION_TO_CONTENT_TYPE[ext] ?? "image/png";

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-length": String(bytes.length),
      "content-disposition": `inline; filename="${item.image}"`,
      "cache-control": "private, max-age=300",
    },
  });
};
