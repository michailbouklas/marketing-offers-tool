import { z } from "zod";
import { requireAuthenticatedUser } from "$lib/server/auth-guards";
import { listBrandsForUser } from "$lib/services/brands.server";
import { BRAND_NONE_KEY } from "$lib/services/image-generator/image-generator";
import {
  listGeneratedImageFilterOptionsForUser,
  listGeneratedImagePromptGroupsForUser,
  listGeneratedImagesHistoryForUser,
} from "$lib/services/image-generator/image-generator.server";
import type { PageServerLoad } from "./$types";

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

export const load: PageServerLoad = async (event) => {
  const { user } = requireAuthenticatedUser(event);
  const query = historyQuerySchema.parse({
    date: event.url.searchParams.get("date") ?? undefined,
    model: event.url.searchParams.get("model") ?? undefined,
    provider: event.url.searchParams.get("provider") ?? undefined,
    page: event.url.searchParams.get("page") ?? undefined,
    view: event.url.searchParams.get("view") ?? undefined,
  });

  const brands = await listBrandsForUser(user!.id);
  const allowedBrandIds = new Set(brands.map((brand) => brand.id));
  const rawBrandValues = event.url.searchParams.getAll("brand");
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
    listGeneratedImagesHistoryForUser(user!.id, filters),
    query.view === "prompt"
      ? listGeneratedImagePromptGroupsForUser(user!.id, filters)
      : Promise.resolve([]),
    listGeneratedImageFilterOptionsForUser(user!.id),
  ]);

  return {
    imagePage,
    promptGroups,
    filterOptions,
    filters: { ...query, brand: selectedBrandKeys },
    brands,
  };
};
