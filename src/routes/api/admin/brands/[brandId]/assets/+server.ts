import { error, json } from "@sveltejs/kit";
import { requireApiAdminPermission } from "$lib/server/auth-guards";
import { getImageGeneratorEnv } from "$lib/server/env";
import { extensionForContentType } from "$lib/server/reference-storage";
import {
  createBrandAsset,
  listBrandAssets,
} from "$lib/services/brand-context/brand-context.server";
import { prisma } from "$lib/server/prisma";
import type { RequestHandler } from "./$types";

function parseBrandId(param: string | undefined): number {
  if (!param) {
    error(400, "brandId is required");
  }
  const id = Number.parseInt(param, 10);
  if (!Number.isInteger(id) || id <= 0) {
    error(400, "brandId must be a positive integer");
  }
  return id;
}

export const GET: RequestHandler = async (event) => {
  await requireApiAdminPermission(event, { brand: ["manage"] });
  const brandId = parseBrandId(event.params.brandId);

  const rows = await listBrandAssets(brandId);
  return json({
    items: rows.map((row) => ({
      id: row.id,
      brandId: row.brandId,
      name: row.name,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
    })),
  });
};

export const POST: RequestHandler = async (event) => {
  await requireApiAdminPermission(event, { brand: ["manage"] });
  const brandId = parseBrandId(event.params.brandId);

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { id: true, slug: true, active: true },
  });
  if (!brand) {
    error(404, "Brand not found");
  }
  if (!brand.slug) {
    error(
      400,
      `Brand ${brandId} has no slug; populate brand.slug before uploading assets`,
    );
  }

  let form: FormData;
  try {
    form = await event.request.formData();
  } catch {
    error(400, "Expected multipart/form-data body");
  }

  const files: File[] = [];
  for (const [, value] of form.entries()) {
    if (value instanceof File) {
      files.push(value);
    }
  }
  if (files.length === 0) {
    error(400, "No files provided");
  }

  for (const file of files) {
    if (!extensionForContentType(file.type)) {
      error(
        400,
        `Unsupported brand asset content type: ${file.type || "<empty>"}`,
      );
    }
  }

  const env = getImageGeneratorEnv();
  const created: Array<{ id: string; name: string; contentType: string }> = [];
  for (const file of files) {
    const row = await createBrandAsset({
      brandId,
      slug: brand.slug,
      file,
      name: file.name || "asset",
      uploadsDir: env.UPLOADS_DIR,
    });
    created.push({
      id: row.id,
      name: row.name,
      contentType: row.contentType,
    });
  }

  return json({ items: created });
};
