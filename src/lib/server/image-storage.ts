import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";

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

export function imageFilePath(uploadsDir: string, id: string): string {
  const safeId = ensureSafeId(id);
  return join(uploadsDir, IMAGES_SUBDIR, `${safeId}.png`);
}

async function ensureImagesDir(uploadsDir: string): Promise<string> {
  const dir = join(uploadsDir, IMAGES_SUBDIR);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export async function writeImageBytes(
  uploadsDir: string,
  id: string,
  bytes: Buffer,
): Promise<string> {
  const safeId = ensureSafeId(id);
  await ensureImagesDir(uploadsDir);
  const filePath = join(uploadsDir, IMAGES_SUBDIR, `${safeId}.png`);
  await writeFile(filePath, bytes, { mode: 0o600 });
  return filePath;
}

export async function readImageBytes(
  uploadsDir: string,
  id: string,
): Promise<Buffer> {
  const filePath = imageFilePath(uploadsDir, id);
  return readFile(filePath);
}
