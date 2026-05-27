import { error, json } from "@sveltejs/kit";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { listBrandAssets } from "$lib/services/brand-context/brand-context.server";
import { prisma } from "$lib/server/prisma";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);

  const brandIdParam = event.url.searchParams.get("brandId");
  if (!brandIdParam) {
    error(400, "brandId query parameter is required");
  }
  const brandId = Number.parseInt(brandIdParam, 10);
  if (!Number.isInteger(brandId) || brandId <= 0) {
    error(400, "brandId must be a positive integer");
  }

  const assignment = await prisma.user_brand.findUnique({
    where: { userId_brandId: { userId: user.id, brandId } },
    select: { brandId: true },
  });
  if (!assignment) {
    error(403, "Brand is not assigned to this user");
  }

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
