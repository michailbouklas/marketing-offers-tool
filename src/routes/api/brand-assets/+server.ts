import { error, json } from "@sveltejs/kit";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { searchBrandAssets } from "$lib/services/brand-context/brand-context.server";
import { prisma } from "$lib/server/prisma";
import type { RequestHandler } from "./$types";

const PAGE_SIZE = 50;

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

  const pageParam = event.url.searchParams.get("page");
  let page = 1;
  if (pageParam !== null) {
    page = Number.parseInt(pageParam, 10);
    if (!Number.isInteger(page) || page <= 0) {
      error(400, "page must be a positive integer");
    }
  }

  const search = event.url.searchParams.get("search")?.trim() || undefined;

  const assignment = await prisma.user_brand.findUnique({
    where: { userId_brandId: { userId: user.id, brandId } },
    select: { brandId: true },
  });
  if (!assignment) {
    error(403, "Brand is not assigned to this user");
  }

  const { items, total } = await searchBrandAssets({
    brandId,
    search,
    page,
    pageSize: PAGE_SIZE,
  });
  return json({
    items: items.map((row) => ({
      id: row.id,
      brandId: row.brandId,
      name: row.name,
      displayName: row.displayName,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  });
};
