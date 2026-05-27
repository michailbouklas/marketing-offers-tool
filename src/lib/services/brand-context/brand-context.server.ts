import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { prisma } from "$lib/server/prisma";
import {
  readBrandGuidelines,
  writeBrandAsset,
  writeBrandGuidelines,
} from "$lib/server/brand-storage";

export interface BrandAssetRow {
  id: string;
  brandId: number;
  name: string;
  localPath: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
}

export async function listBrandAssets(
  brandId: number,
): Promise<BrandAssetRow[]> {
  return prisma.brandAsset.findMany({
    where: { brandId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getBrandAsset(
  brandId: number,
  assetId: string,
): Promise<BrandAssetRow | null> {
  const row = await prisma.brandAsset.findUnique({ where: { id: assetId } });
  if (!row || row.brandId !== brandId) {
    return null;
  }
  return row;
}

export interface CreateBrandAssetArgs {
  brandId: number;
  slug: string;
  file: File;
  name: string;
  uploadsDir: string;
}

export async function createBrandAsset(
  args: CreateBrandAssetArgs,
): Promise<BrandAssetRow> {
  const id = randomUUID();
  const written = await writeBrandAsset(
    args.uploadsDir,
    args.slug,
    id,
    args.file,
  );
  return prisma.brandAsset.create({
    data: {
      id,
      brandId: args.brandId,
      name: args.name,
      localPath: written.localPath,
      contentType: written.contentType,
      sizeBytes: written.sizeBytes,
    },
  });
}

export async function deleteBrandAsset(assetId: string): Promise<void> {
  const row = await prisma.brandAsset.findUnique({
    where: { id: assetId },
    select: { id: true, localPath: true },
  });
  if (!row) {
    return;
  }
  await prisma.brandAsset.delete({ where: { id: row.id } });
  try {
    await unlink(row.localPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
}

export async function getBrandGuidelines(
  slug: string,
  uploadsDir: string,
): Promise<string | null> {
  return readBrandGuidelines(uploadsDir, slug);
}

export async function setBrandGuidelines(
  slug: string,
  markdown: string,
  uploadsDir: string,
): Promise<void> {
  await writeBrandGuidelines(uploadsDir, slug, markdown);
}
