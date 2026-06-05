import { z } from "zod";
import { listBrandsForUser } from "$lib/services/brands.server";
import { BRAND_NONE_KEY } from "$lib/services/image-generator/image-generator";
import {
  listGeneratedImageFilterOptionsForUser,
  listGeneratedImagePromptGroupsForUser,
  listGeneratedImagesHistoryForUser,
} from "$lib/services/image-generator/image-generator.server";

const historyQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  model: z.string().min(1).optional().catch(undefined),
  provider: z.string().min(1).optional().catch(undefined),
  page: z.coerce.number().int().positive().optional().catch(1),
  view: z.enum(["table", "prompt"]).optional().catch("table"),
});

/**
 * Shared loader for a user's generation-history page: parses the filter query
 * string, restricts the brand filter to the target user's assigned brands, and
 * fetches the paged history plus prompt groups and filter options. Used by both
 * `/image-generator/me` (own history) and `/image-generator/[userId]`
 * (super-user drill-down).
 */
export async function loadGenerationsHistory(url: URL, userId: string) {
  const query = historyQuerySchema.parse({
    date: url.searchParams.get("date") ?? undefined,
    model: url.searchParams.get("model") ?? undefined,
    provider: url.searchParams.get("provider") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    view: url.searchParams.get("view") ?? undefined,
  });

  const brands = await listBrandsForUser(userId);
  const allowedBrandIds = new Set(brands.map((brand) => brand.id));
  const rawBrandValues = url.searchParams.getAll("brand");
  const includeNoBrand = rawBrandValues.includes(BRAND_NONE_KEY);
  const selectedBrandIds = [
    ...new Set(
      rawBrandValues
        .map((value) => Number.parseInt(value, 10))
        .filter((id) => Number.isInteger(id) && allowedBrandIds.has(id)),
    ),
  ];
  const selectedBrandKeys = [
    ...selectedBrandIds.map((id) => String(id)),
    ...(includeNoBrand ? [BRAND_NONE_KEY] : []),
  ];

  const filters = {
    ...query,
    brandIds: selectedBrandIds,
    includeNoBrand,
  };

  const [imagePage, promptGroups, filterOptions] = await Promise.all([
    listGeneratedImagesHistoryForUser(userId, filters),
    query.view === "prompt"
      ? listGeneratedImagePromptGroupsForUser(userId, filters)
      : Promise.resolve([]),
    listGeneratedImageFilterOptionsForUser(userId),
  ]);

  return {
    imagePage,
    promptGroups,
    filterOptions,
    filters: { ...query, brand: selectedBrandKeys },
    brands,
  };
}
