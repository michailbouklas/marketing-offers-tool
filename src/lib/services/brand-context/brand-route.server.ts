import { error } from "@sveltejs/kit";
import { prisma } from "$lib/server/prisma";

/**
 * Shared by the admin brand sub-resource routes
 * (/api/admin/brands/[brandId]/guidelines and /compliance-rules).
 */
export function parseBrandId(param: string | undefined): number {
  if (!param) {
    error(400, "brandId is required");
  }
  const id = Number.parseInt(param, 10);
  if (!Number.isInteger(id) || id <= 0) {
    error(400, "brandId must be a positive integer");
  }
  return id;
}

export async function brandSlugOr404(brandId: number): Promise<string> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { id: true, slug: true },
  });
  if (!brand) {
    error(404, "Brand not found");
  }
  if (!brand.slug) {
    error(
      400,
      `Brand ${brandId} has no slug; populate brand.slug before editing it`,
    );
  }
  return brand.slug;
}
