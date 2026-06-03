import { normalize, sep } from "node:path";
import type { ObjectStore, StorageKey } from "./object-store.server";

const IMAGES_SUBDIR = "images";

function ensureSafeId(id: string): string {
  if (!id || id.includes("/") || id.includes("\\") || id.includes("..")) {
    throw new Error(`Invalid image id: ${JSON.stringify(id)}`);
  }
  const normalized = normalize(id);
  if (normalized !== id || normalized.includes(sep)) {
    throw new Error(`Invalid image id: ${JSON.stringify(id)}`);
  }
  return id;
}

/** Portable storage key for a generated image, e.g. `images/<id>.png`. */
export function imageKey(
  id: string,
  format: "png" | "jpg" = "png",
): StorageKey {
  const safeId = ensureSafeId(id);
  const ext = format === "jpg" ? "jpg" : "png";
  return `${IMAGES_SUBDIR}/${safeId}.${ext}`;
}

export async function writeImageBytes(
  store: ObjectStore,
  id: string,
  bytes: Buffer,
  format: "png" | "jpg" = "png",
): Promise<StorageKey> {
  const key = imageKey(id, format);
  const contentType = format === "jpg" ? "image/jpeg" : "image/png";
  await store.put(key, bytes, contentType);
  return key;
}

export async function readImageBytes(
  store: ObjectStore,
  id: string,
  format: "png" | "jpg" = "png",
): Promise<Buffer> {
  return store.get(imageKey(id, format));
}
