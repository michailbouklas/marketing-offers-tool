import { fail } from "@sveltejs/kit";
import { z } from "zod";
import { message, superValidate } from "sveltekit-superforms/server";
import { zod4 } from "sveltekit-superforms/adapters";
import { requirePermission } from "$lib/server/auth-guards";
import {
  getDefaultReviewCategoryFormData,
  ReviewCategoryConflictError,
  ReviewCategoryNotFoundError,
  ReviewCategoryStaleError,
  reviewCategoryFormSchema,
  reviewCategoryStatusFilters,
  setReviewCategoriesActiveSchema,
  type ReviewCategoryActionMessage,
} from "$lib/services/google-reviews-admin/categories";
import {
  listReviewCategoriesPage,
  setReviewCategoriesActive,
  updateReviewCategory,
} from "$lib/services/google-reviews-admin/categories.server";
import type { Actions, PageServerLoad } from "./$types";

const PAGE_SIZE = 50;
const EDIT_FORM_ID = "edit-review-category";

const searchParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  query: z.preprocess((value) => {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().trim().min(1).optional()),
  status: z.enum(reviewCategoryStatusFilters).default("all"),
});

export const load: PageServerLoad = async (event) => {
  // The /admin hooks gate already enforces an admin-section role; this
  // additionally requires the Google Reviews manage capability.
  await requirePermission(event, { googleReviews: ["manage"] });

  const parseResult = searchParamsSchema.safeParse({
    page: event.url.searchParams.get("page") ?? 1,
    query: event.url.searchParams.get("query") ?? undefined,
    status: event.url.searchParams.get("status") ?? undefined,
  });
  const page = parseResult.success ? parseResult.data.page : 1;
  const query = parseResult.success ? (parseResult.data.query ?? null) : null;
  const status = parseResult.success ? parseResult.data.status : "all";

  const [editForm, categoriesPage] = await Promise.all([
    superValidate(
      getDefaultReviewCategoryFormData(),
      zod4(reviewCategoryFormSchema),
      { errors: false, id: EDIT_FORM_ID },
    ),
    listReviewCategoriesPage({ page, pageSize: PAGE_SIZE, query, status }),
  ]);

  return { editForm, categoriesPage, query, status };
};

export const actions: Actions = {
  updateCategory: async (event) => {
    await requirePermission(event, { googleReviews: ["manage"] });

    const formData = await event.request.formData();
    const form = await superValidate(formData, zod4(reviewCategoryFormSchema), {
      id: EDIT_FORM_ID,
    });

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      const updated = await updateReviewCategory({
        id: form.data.id,
        expectedVersion: form.data.version,
        category: form.data.category,
        summary: form.data.summary,
        isActive: form.data.isActive,
      });

      // Keep the form in step with the row so a second save in the same
      // dialog session carries the bumped version.
      form.data.version = updated.version;

      return message<ReviewCategoryActionMessage>(form, {
        type: "success",
        text: `Saved "${updated.category ?? "category"}".`,
      });
    } catch (error) {
      if (
        error instanceof ReviewCategoryConflictError ||
        error instanceof ReviewCategoryStaleError ||
        error instanceof ReviewCategoryNotFoundError
      ) {
        return message<ReviewCategoryActionMessage>(
          form,
          { type: "error", text: error.message },
          { status: 409 },
        );
      }

      throw error;
    }
  },

  setActive: async (event) => {
    await requirePermission(event, { googleReviews: ["manage"] });

    const formData = await event.request.formData();
    const rawPayload = formData.get("payload")?.toString() ?? "";

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawPayload);
    } catch {
      return fail(400, {
        bulkError: "Could not read the selected categories.",
      });
    }

    const parsed = setReviewCategoriesActiveSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return fail(400, {
        bulkError: "Select at least one category first.",
      });
    }

    try {
      const updated = await setReviewCategoriesActive(
        parsed.data.ids,
        parsed.data.isActive,
      );

      return { bulkUpdated: updated, bulkIsActive: parsed.data.isActive };
    } catch (error) {
      if (error instanceof ReviewCategoryConflictError) {
        return fail(409, { bulkError: error.message });
      }

      throw error;
    }
  },
};
