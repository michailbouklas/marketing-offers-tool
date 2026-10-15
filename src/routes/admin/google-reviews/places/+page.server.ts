import { fail, type NumericRange } from "@sveltejs/kit";
import { z } from "zod";
import { message, superValidate } from "sveltekit-superforms/server";
import { zod4 } from "sveltekit-superforms/adapters";
import { requirePermission } from "$lib/server/auth-guards";
import {
  deleteScrapeQuerySchema,
  getDefaultScrapeQueryFormData,
  GooglePlacesApiError,
  scrapeQueryFormSchema,
  scrapeQueryStatusFilters,
  type PlaceBrandSyncSummary,
  type ScrapeQueriesPage,
  type ScrapeQueryActionMessage,
  type ScrapeQueryBrand,
} from "$lib/services/google-reviews-admin/places";
import {
  createScrapeQuery,
  deleteScrapeQuery,
  getScrapeQuery,
  listScrapeQueriesPage,
  listScrapeQueryBrands,
  updateScrapeQuery,
} from "$lib/services/google-reviews-admin/places.server";
import {
  formatPlaceBrandSyncMessage,
  listPlaceBrandOptions,
  propagateAllPlaceBrands,
  propagatePlaceBrand,
} from "$lib/services/google-reviews-admin/place-brand-sync.server";
import { getScrapeRunsStatus } from "$lib/services/google-reviews-admin/scrape-run.server";
import type { Actions, PageServerLoad } from "./$types";

const PAGE_SIZE = 50;
const FORM_ID = "scrape-query";

const searchParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  query: z.preprocess((value) => {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().trim().min(1).optional()),
  status: z.enum(scrapeQueryStatusFilters).default("all"),
});

/** HTTP status an action answers with for an upstream failure. */
function actionStatus(error: GooglePlacesApiError): NumericRange<400, 599> {
  if (error.status >= 500) {
    return 503;
  }

  return error.status >= 400 ? (error.status as NumericRange<400, 599>) : 502;
}

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

  const form = await superValidate(
    getDefaultScrapeQueryFormData(),
    zod4(scrapeQueryFormSchema),
    { errors: false, id: FORM_ID },
  );

  let placesPage: ScrapeQueriesPage = {
    items: [],
    page,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 1,
  };
  let brands: ScrapeQueryBrand[] = [];
  let loadError: string | null = null;

  try {
    // Brands only label the brand column and fill the dialog dropdown; a
    // failure there must not take the whole page down.
    [placesPage, brands] = await Promise.all([
      listScrapeQueriesPage({
        page,
        pageSize: PAGE_SIZE,
        search: query,
        status,
      }),
      listScrapeQueryBrands().catch((error: unknown) => {
        console.warn("[google-reviews/places] Could not load brands", error);
        return [] as ScrapeQueryBrand[];
      }),
    ]);
  } catch (error) {
    if (error instanceof GooglePlacesApiError) {
      loadError = error.message;
    } else {
      throw error;
    }
  }

  // Label scraper brands with the app brand they map to (and keep mapped app
  // brands selectable even when the scraper's brand list failed to load).
  brands = await listPlaceBrandOptions(brands);

  return {
    form,
    placesPage,
    brands,
    query,
    status,
    loadError,
    scrapeRuns: getScrapeRunsStatus(),
  };
};

export const actions: Actions = {
  savePlace: async (event) => {
    const { user } = await requirePermission(event, {
      googleReviews: ["manage"],
    });

    const formData = await event.request.formData();
    const form = await superValidate(formData, zod4(scrapeQueryFormSchema), {
      id: FORM_ID,
    });

    if (!form.valid) {
      return fail(400, { form });
    }

    const input = {
      query: form.data.query,
      enabled: form.data.enabled,
      brandId: form.data.brandId,
      notes: form.data.notes,
    };

    try {
      // The brand the place carried before this save lets propagation move
      // businesses from the old brand to the new one.
      let previousBrandId: number | null | undefined;
      if (form.data.id !== 0) {
        previousBrandId = (await getScrapeQuery(form.data.id)).brandId;
      }

      const saved =
        form.data.id === 0
          ? await createScrapeQuery(input)
          : await updateScrapeQuery(form.data.id, input);

      // A second save in the same dialog session must update, not re-create.
      form.data.id = saved.id;

      let syncText = "";
      if (saved.brandId !== null) {
        try {
          syncText = formatPlaceBrandSyncMessage(
            await propagatePlaceBrand({
              placeId: saved.id,
              remoteBrandId: saved.brandId,
              previousRemoteBrandId: previousBrandId,
              actorUserId: user?.id ?? null,
            }),
          );
        } catch (syncError) {
          console.warn(
            `[google-reviews/places] brand propagation for place ${saved.id} failed`,
            syncError,
          );
          syncText =
            "Brand links could not be updated; use Sync brand links to retry.";
        }
      }

      return message<ScrapeQueryActionMessage>(form, {
        type: "success",
        text: `Saved "${saved.query}".${syncText ? ` ${syncText}` : ""}`,
      });
    } catch (error) {
      if (error instanceof GooglePlacesApiError) {
        return message<ScrapeQueryActionMessage>(
          form,
          { type: "error", text: error.message },
          { status: actionStatus(error) },
        );
      }

      throw error;
    }
  },

  /** Backfill: propagate every place's brand to its discovered businesses. */
  syncBrands: async (event) => {
    const { user } = await requirePermission(event, {
      googleReviews: ["manage"],
    });

    try {
      const { totals } = await propagateAllPlaceBrands(user?.id ?? null);
      return { synced: totals satisfies PlaceBrandSyncSummary };
    } catch (error) {
      if (error instanceof GooglePlacesApiError) {
        return fail(actionStatus(error), { syncError: error.message });
      }

      throw error;
    }
  },

  deletePlace: async (event) => {
    await requirePermission(event, { googleReviews: ["manage"] });

    const formData = await event.request.formData();
    const parsed = deleteScrapeQuerySchema.safeParse({
      id: formData.get("id")?.toString() ?? "",
    });

    if (!parsed.success) {
      return fail(400, {
        deleteError: "Could not tell which place to delete.",
      });
    }

    try {
      await deleteScrapeQuery(parsed.data.id);
      return { deleted: parsed.data.id };
    } catch (error) {
      if (error instanceof GooglePlacesApiError) {
        return fail(actionStatus(error), { deleteError: error.message });
      }

      throw error;
    }
  },
};
