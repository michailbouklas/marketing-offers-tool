import { mkdir, writeFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";

const REFERENCES_SUBDIR = "references";

const CONTENT_TYPE_TO_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

export interface WriteReferenceResult {
  id: string;
  localPath: string;
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

export function referenceFilePath(
  uploadsDir: string,
  id: string,
  extension: string,
): string {
  const safeId = ensureSafeId(id);
  return join(uploadsDir, REFERENCES_SUBDIR, `${safeId}.${extension}`);
}

async function ensureReferencesDir(uploadsDir: string): Promise<string> {
  const dir = join(uploadsDir, REFERENCES_SUBDIR);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export async function writeReferenceFile(
  uploadsDir: string,
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

  await ensureReferencesDir(uploadsDir);
  const filePath = referenceFilePath(uploadsDir, safeId, extension);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer, { mode: 0o600 });

  return {
    id: safeId,
    localPath: filePath,
    contentType,
    extension,
  };
}
