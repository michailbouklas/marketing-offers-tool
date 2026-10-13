import type { BrandOption } from "$lib/services/brands";
import { prisma } from "$lib/server/prisma";
import type { GapBrandPricingTarget } from "$lib/services/offers-data-quality";
import { normalizeBrandAlias } from "$lib/services/offers-data-quality-snapshot";

/**
 * Resolve the Postgres brand behind a ClickHouse brand code (e.g. "kfc") via
 * `brand.alias`, which is how the gap queue already filters by brand. Returns
 * null when no brand carries that alias.
 */
export async function getBrandPricingTargetByAlias(
  alias: string,
): Promise<GapBrandPricingTarget | null> {
  const normalizedAlias = normalizeBrandAlias(alias);

  if (!normalizedAlias) {
    return null;
  }

  const brand = await prisma.brand.findFirst({
    where: {
      alias: {
        equals: normalizedAlias,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      name: true,
      ideal_fc_perc: true,
    },
    orderBy: { id: "asc" },
  });

  if (!brand) {
    return null;
  }

  return {
    brand_id: brand.id,
    brand_name: brand.name,
    ideal_fc_perc:
      brand.ideal_fc_perc === null ? null : Number(brand.ideal_fc_perc),
  };
}

type ListBrandsFilters = {
  active?: boolean;
};

export async function listBrands(
  filters: ListBrandsFilters = {},
): Promise<BrandOption[]> {
  return prisma.brand.findMany({
    where: {
      ...(filters.active !== undefined ? { active: filters.active } : {}),
    },
    select: {
      id: true,
      name: true,
      alias: true,
      slug: true,
      active: true,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}

export async function listBrandsForUser(
  userId: string,
  filters: ListBrandsFilters = {},
): Promise<BrandOption[]> {
  return prisma.brand.findMany({
    where: {
      user_assignments: {
        some: {
          userId,
        },
      },
      ...(filters.active !== undefined ? { active: filters.active } : {}),
    },
    select: {
      id: true,
      name: true,
      alias: true,
      slug: true,
      active: true,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}
