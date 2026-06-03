import { normalize, sep } from "node:path";
import type { ObjectStore, StorageKey } from "./object-store.server";

const REFERENCES_SUBDIR = "references";

const CONTENT_TYPE_TO_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

export interface WriteReferenceResult {
  id: string;
  /** Portable storage key (persisted in the `localPath` column). */
  localPath: StorageKey;
  contentType: string;
  extension: string;
}

function ensureSafeId(id: string): string {
  if (!id || id.includes("/") || id.includes("\\") || id.includes("..")) {
    throw new Error(`Invalid reference id: ${JSON.stringify(id)}`);
  }
  const normalized = normalize(id);
  if (normalized !== id || normalized.includes(sep)) {
    throw new Error(`Invalid reference id: ${JSON.stringify(id)}`);
  }
  return id;
}

export function extensionForContentType(contentType: string): string | null {
  if (!contentType) {
    return null;
  }
  const normalized = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  return CONTENT_TYPE_TO_EXTENSION[normalized] ?? null;
}

/** Portable storage key for a reference image, e.g. `references/<id>.png`. */
export function referenceKey(id: string, extension: string): StorageKey {
  return `${REFERENCES_SUBDIR}/${ensureSafeId(id)}.${extension}`;
}

export async function writeReferenceFile(
  store: ObjectStore,
  id: string,
  file: File,
): Promise<WriteReferenceResult> {
  const safeId = ensureSafeId(id);
  const contentType = file.type ?? "";
  const extension = extensionForContentType(contentType);
  if (!extension) {
    throw new Error(
      `Unsupported reference content type: ${JSON.stringify(contentType)}`,
    );
  }

  const key = referenceKey(safeId, extension);
  const buffer = Buffer.from(await file.arrayBuffer());
  await store.put(key, buffer, contentType);

  return {
    id: safeId,
    localPath: key,
    contentType,
    extension,
  };
}
