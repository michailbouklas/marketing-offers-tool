import { requirePermission } from "$lib/server/auth-guards";
import { prisma } from "$lib/server/prisma";
import { listBrands } from "$lib/services/brands.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  // /admin hooks gate enforces admin; this additionally requires the brand
  // management capability, so an admin without `brandManager` is redirected.
  await requirePermission(event, { brand: ["manage"] });

  const [brands, counts] = await Promise.all([
    listBrands(),
    prisma.brandAsset.groupBy({
      by: ["brandId"],
      _count: { _all: true },
    }),
  ]);

  const countByBrand = new Map<number, number>();
  for (const row of counts) {
    countByBrand.set(row.brandId, row._count._all);
  }

  return {
    brands: brands.map((brand) => ({
      ...brand,
      assetCount: countByBrand.get(brand.id) ?? 0,
    })),
  };
};
