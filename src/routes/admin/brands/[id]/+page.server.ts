import { error } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/auth-guards";
import { getImageGeneratorEnv } from "$lib/server/env";
import { prisma } from "$lib/server/prisma";
import {
  getBrandGuidelines,
  listBrandAssets,
} from "$lib/services/brand-context/brand-context.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { brand: ["manage"] });

  const brandId = Number.parseInt(event.params.id ?? "", 10);
  if (!Number.isInteger(brandId) || brandId <= 0) {
    error(400, "Invalid brand id");
  }

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { id: true, name: true, slug: true, active: true, alias: true },
  });
  if (!brand) {
    error(404, "Brand not found");
  }

  const env = getImageGeneratorEnv();
  const [assets, guidelines] = await Promise.all([
    listBrandAssets(brand.id),
    brand.slug
      ? getBrandGuidelines(brand.slug, env.UPLOADS_DIR)
      : Promise.resolve(null),
  ]);

  return {
    brand,
    assets: assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      contentType: asset.contentType,
      sizeBytes: asset.sizeBytes,
      createdAt:
        asset.createdAt instanceof Date
          ? asset.createdAt.toISOString()
          : String(asset.createdAt),
    })),
    guidelines: guidelines ?? "",
  };
};
