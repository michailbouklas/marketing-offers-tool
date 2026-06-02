import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { message, superValidate } from "sveltekit-superforms/server";
import { zod4 } from "sveltekit-superforms/adapters";
import {
  createOffer,
  getOffers,
  updateOffer,
} from "$lib/services/aggregator-offers.server";
import { listBrands } from "$lib/services/brands.server";
import {
  type OfferEditorActionMessage,
  getDefaultOfferEditorFormData,
  mapOfferEditorFormToCreateInput,
  offerEditorFormSchema,
} from "$lib/services/offer-editor-form";
import {
  getOffersFilterFormData,
  mapOffersFilterFormToFilters,
  offersFilterFormSchema,
} from "$lib/services/offers-filter-form";
import {
  hasPermission,
  requireAuthenticatedUser,
  requirePermission,
} from "$lib/server/auth-guards";

export const load: PageServerLoad = async (event) => {
  requireAuthenticatedUser(event);

  const { url } = event;
  const filterValues = getOffersFilterFormData(url);
  const canEditOffers = await hasPermission(event, { offer: ["edit"] });
  const [filterForm, createForm, editForm, offers, brands] = await Promise.all([
    superValidate(filterValues, zod4(offersFilterFormSchema), {
      errors: false,
    }),
    superValidate(
      getDefaultOfferEditorFormData(),
      zod4(offerEditorFormSchema),
      {
        errors: false,
        id: "create-offer",
      },
    ),
    superValidate(
      getDefaultOfferEditorFormData(),
      zod4(offerEditorFormSchema),
      {
        errors: false,
        id: "edit-offer",
      },
    ),
    getOffers(mapOffersFilterFormToFilters(filterValues)),
    listBrands({ active: true }),
  ]);

  return {
    filterForm,
    createForm,
    editForm,
    offers,
    brands,
    canEditOffers,
  };
};

export const actions: Actions = {
  createOffer: async (event) => {
    await requirePermission(event, { offer: ["edit"] });

    const formData = await event.request.formData();
    const submitMode = formData.get("submitMode")?.toString() ?? "create";

    const form = await superValidate(formData, zod4(offerEditorFormSchema), {
      id: "create-offer",
    });

    if (!form.valid) {
      return fail(400, { form });
    }

    const offer = await createOffer(mapOfferEditorFormToCreateInput(form.data));

    return message<OfferEditorActionMessage>(form, {
      text: "Offer created successfully.",
      offerId: offer.id,
      mode: "create",
      keepOpen: submitMode === "createAndAddNew",
    });
  },

  updateOffer: async (event) => {
    await requirePermission(event, { offer: ["edit"] });

    const formData = await event.request.formData();
    const offerDbId = Number.parseInt(
      formData.get("offerDbId")?.toString() ?? "",
      10,
    );

    const form = await superValidate(formData, zod4(offerEditorFormSchema), {
      id: "edit-offer",
    });

    if (!Number.isInteger(offerDbId)) {
      return fail(400, { form });
    }

    if (!form.valid) {
      return fail(400, { form });
    }

    const offer = await updateOffer(
      offerDbId,
      mapOfferEditorFormToCreateInput(form.data),
    );

    return message<OfferEditorActionMessage>(form, {
      text: "Offer updated successfully.",
      offerId: offer.id,
      mode: "edit",
    });
  },
};
