import { listBrandsForUser } from "$lib/services/brands.server";
import { getSelectedBrandAliases } from "$lib/services/offers-data-quality";
import { z } from "zod";

const isoDate = z.iso.date().optional().catch(undefined);
const paramsSchema = z.object({
  from: isoDate,
  to: isoDate,
  search: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().positive().catch(1),
});

/** The page and its export read the same URL params, scoped to the user's brands. */
export async function readApprovedOffersQuery(url: URL, userId: string) {
  const params = url.searchParams;
  const brands = await listBrandsForUser(userId);
  const { page, ...filters } = paramsSchema.parse({
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    search: params.get("q") ?? undefined,
    page: params.get("page") ?? undefined,
  });

  return {
    brands,
    selectedBrandAliases: getSelectedBrandAliases(
      params.getAll("brandAlias"),
      brands,
    ),
    filters,
    page,
  };
}
