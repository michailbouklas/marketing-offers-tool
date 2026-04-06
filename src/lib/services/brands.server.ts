import type { BrandOption } from "$lib/services/brands";
import { prisma } from "$lib/server/prisma";

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
