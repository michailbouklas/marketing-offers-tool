import { error } from "@sveltejs/kit";
import { zod4 } from "sveltekit-superforms/adapters";
import { superValidate } from "sveltekit-superforms/server";
import { requireAuthenticatedUser } from "$lib/server/auth-guards";
import {
  getGapFormData,
  getPendingGapSubmission,
} from "$lib/services/offers-data-quality.server";
import {
  applyGapPricingLookupDefaults,
  gapPricingFormSchema,
  getDefaultGapPricingFormData,
  gapRouteParamsSchema,
  mapGapLoadResponseToGapPricingFormData,
} from "$lib/services/offers-data-quality";
import {
  listChannels,
  listPricingCategories,
  listPricingSubcategoriesByCategoryId,
} from "$lib/services/offers-data-quality-postgres.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  requireAuthenticatedUser(event);

  const paramsResult = gapRouteParamsSchema.safeParse(event.params);

  if (!paramsResult.success) {
    error(400, "A valid gap id is required");
  }

  const gapData = await getGapFormData(paramsResult.data.id);

  if (!gapData) {
    error(404, "Gap not found");
  }

  const baseFormValues = mapGapLoadResponseToGapPricingFormData(gapData);
  const [channels, categories, pendingSubmission] = await Promise.all([
    listChannels(),
    listPricingCategories(),
    getPendingGapSubmission(gapData.trde_item),
  ]);
  const initialCategory = baseFormValues.category || categories[0]?.name || "";
  const subcategories = initialCategory
    ? await listPricingSubcategoriesForCategoryName(initialCategory)
    : [];
  const formValues = applyGapPricingLookupDefaults(baseFormValues, {
    channels,
    categories,
    subcategories,
  });
  const form = await superValidate(formValues, zod4(gapPricingFormSchema), {
    errors: false,
    id: "gap-pricing-form",
  });

  return {
    form,
    gap: gapData,
    channels,
    categories,
    subcategories,
    pendingSubmission,
    emptyForm: getDefaultGapPricingFormData(),
  };
};

async function listPricingSubcategoriesForCategoryName(categoryName: string) {
  const categories = await listPricingCategories();
  const category = categories.find((option) => option.name === categoryName);

  if (!category) {
    return [];
  }

  return listPricingSubcategoriesByCategoryId(category.id);
}
