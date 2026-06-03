import { normalize, sep } from "node:path";
import type { ObjectStore, StorageKey } from "./object-store.server";
import { extensionForContentType } from "./reference-storage";

const BRANDS_SUBDIR = "brands";
const ASSETS_SUBDIR = "assets";
const GUIDELINES_FILE = "guidelines.md";

export interface WriteBrandAssetResult {
  id: string;
  /** Portable storage key (persisted in the `localPath` column). */
  localPath: StorageKey;
  contentType: string;
  extension: string;
  sizeBytes: number;
}

function ensureSafeSlug(slug: string): string {
  if (
    !slug ||
    slug.includes("/") ||
    slug.includes("\\") ||
    slug.includes("..")
  ) {
    throw new Error(`Invalid brand slug: ${JSON.stringify(slug)}`);
  }
  const normalized = normalize(slug);
  if (normalized !== slug || normalized.includes(sep)) {
    throw new Error(`Invalid brand slug: ${JSON.stringify(slug)}`);
  }
  return slug;
}

function ensureSafeAssetId(id: string): string {
  if (!id || id.includes("/") || id.includes("\\") || id.includes("..")) {
    throw new Error(`Invalid brand asset id: ${JSON.stringify(id)}`);
  }
  const normalized = normalize(id);
  if (normalized !== id || normalized.includes(sep)) {
    throw new Error(`Invalid brand asset id: ${JSON.stringify(id)}`);
  }
  return id;
}

export function brandAssetKey(
  slug: string,
  id: string,
  extension: string,
): StorageKey {
  return `${BRANDS_SUBDIR}/${ensureSafeSlug(slug)}/${ASSETS_SUBDIR}/${ensureSafeAssetId(id)}.${extension}`;
}

export function brandGuidelinesKey(slug: string): StorageKey {
  return `${BRANDS_SUBDIR}/${ensureSafeSlug(slug)}/${GUIDELINES_FILE}`;
}

export async function writeBrandAsset(
  store: ObjectStore,
  slug: string,
  id: string,
  file: File,
): Promise<WriteBrandAssetResult> {
  const safeSlug = ensureSafeSlug(slug);
  const safeId = ensureSafeAssetId(id);
  const contentType = file.type ?? "";
  const extension = extensionForContentType(contentType);
  if (!extension) {
    throw new Error(
      `Unsupported brand asset content type: ${JSON.stringify(contentType)}`,
    );
  }

  const key = brandAssetKey(safeSlug, safeId, extension);
  const buffer = Buffer.from(await file.arrayBuffer());
  await store.put(key, buffer, contentType);

  return {
    id: safeId,
    localPath: key,
    contentType,
    extension,
    sizeBytes: buffer.byteLength,
  };
}

export async function deleteBrandAsset(
  store: ObjectStore,
  slug: string,
  id: string,
  extension: string,
): Promise<void> {
  await store.remove(brandAssetKey(slug, id, extension));
}

export async function readBrandGuidelines(
  store: ObjectStore,
  slug: string,
): Promise<string | null> {
  return store.getText(brandGuidelinesKey(slug));
}

export async function writeBrandGuidelines(
  store: ObjectStore,
  slug: string,
  markdown: string,
): Promise<void> {
  await store.putText(brandGuidelinesKey(slug), markdown);
}
