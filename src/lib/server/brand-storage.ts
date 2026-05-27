import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { extensionForContentType } from "./reference-storage";

const BRANDS_SUBDIR = "brands";
const ASSETS_SUBDIR = "assets";
const GUIDELINES_FILE = "guidelines.md";

export interface WriteBrandAssetResult {
  id: string;
  localPath: string;
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

export function brandDir(uploadsDir: string, slug: string): string {
  return join(uploadsDir, BRANDS_SUBDIR, ensureSafeSlug(slug));
}

export function brandAssetsDir(uploadsDir: string, slug: string): string {
  return join(brandDir(uploadsDir, slug), ASSETS_SUBDIR);
}

export function brandGuidelinesPath(uploadsDir: string, slug: string): string {
  return join(brandDir(uploadsDir, slug), GUIDELINES_FILE);
}

export function brandAssetPath(
  uploadsDir: string,
  slug: string,
  id: string,
  extension: string,
): string {
  return join(
    brandAssetsDir(uploadsDir, slug),
    `${ensureSafeAssetId(id)}.${extension}`,
  );
}

async function ensureBrandAssetsDir(
  uploadsDir: string,
  slug: string,
): Promise<string> {
  const dir = brandAssetsDir(uploadsDir, slug);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

async function ensureBrandDir(
  uploadsDir: string,
  slug: string,
): Promise<string> {
  const dir = brandDir(uploadsDir, slug);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export async function writeBrandAsset(
  uploadsDir: string,
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

  await ensureBrandAssetsDir(uploadsDir, safeSlug);
  const filePath = brandAssetPath(uploadsDir, safeSlug, safeId, extension);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer, { mode: 0o600 });

  return {
    id: safeId,
    localPath: filePath,
    contentType,
    extension,
    sizeBytes: buffer.byteLength,
  };
}

export async function deleteBrandAsset(
  uploadsDir: string,
  slug: string,
  id: string,
  extension: string,
): Promise<void> {
  const filePath = brandAssetPath(uploadsDir, slug, id, extension);
  try {
    await unlink(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
}

export async function readBrandGuidelines(
  uploadsDir: string,
  slug: string,
): Promise<string | null> {
  const path = brandGuidelinesPath(uploadsDir, slug);
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

export async function writeBrandGuidelines(
  uploadsDir: string,
  slug: string,
  markdown: string,
): Promise<void> {
  await ensureBrandDir(uploadsDir, slug);
  await writeFile(brandGuidelinesPath(uploadsDir, slug), markdown, {
    mode: 0o600,
  });
}
