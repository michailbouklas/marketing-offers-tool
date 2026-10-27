import { error, json } from "@sveltejs/kit";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { getBrandComplianceRules } from "$lib/services/brand-context/brand-context.server";
import { prisma } from "$lib/server/prisma";
import type { RequestHandler } from "./$types";

/** Mirror of /api/brand-guidelines for the compliance checker. */
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

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { slug: true },
  });
  if (!brand || !brand.slug) {
    return json({ markdown: "" });
  }

  const markdown = await getBrandComplianceRules(brand.slug);
  return json({ markdown: markdown ?? "" });
};
