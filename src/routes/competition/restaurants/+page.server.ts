import { requirePermission } from "$lib/server/auth-guards";
import {
  competitionSortDirections,
  competitionTrackStates,
  restaurantSortFields,
} from "$lib/services/competition/competition";
import {
  getUserRestaurantPrefs,
  setRestaurantPref,
} from "$lib/services/competition/preferences.server";
import { listProcessors } from "$lib/services/competition/processors.server";
import { listRestaurantsPage } from "$lib/services/competition/restaurants.server";
import { fail, redirect } from "@sveltejs/kit";
import { z } from "zod";
import type { Actions, PageServerLoad } from "./$types";

const PAGE_SIZE = 50;

// GET form submits include untouched fields as empty strings (e.g.
// `processorId=`), so every optional field must treat "" as "not set" and
// fail per-field (`catch`) — otherwise one empty param fails the combined
// safeParse and silently drops ALL filters.
function emptyToUndefined(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const optionalTrimmedString = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).optional(),
);

const optionalPositiveInt = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().positive().optional(),
);

const searchParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1).catch(1),
  query: optionalTrimmedString.catch(undefined),
  processorId: optionalPositiveInt.catch(undefined),
  sortBy: z.enum(restaurantSortFields).default("name").catch("name"),
  sortDir: z.enum(competitionSortDirections).default("asc").catch("asc"),
});

const toggleTrackSchema = z.object({
  processorId: z.coerce.number().int().positive(),
  restaurantId: z.coerce.number().int().positive(),
  // Empty string clears the preference back to the untracked default.
  state: z.union([z.enum(competitionTrackStates), z.literal("")]),
});

export const load: PageServerLoad = async (event) => {
  const { user } = await requirePermission(event, { competition: ["view"] });

  if (!user) {
    redirect(302, "/login");
  }

  const processors = await listProcessors();
  const parseResult = searchParamsSchema.safeParse({
    page: event.url.searchParams.get("page") ?? 1,
    query: event.url.searchParams.get("query") ?? undefined,
    processorId: event.url.searchParams.get("processorId") ?? undefined,
    sortBy: event.url.searchParams.get("sortBy") ?? undefined,
    sortDir: event.url.searchParams.get("sortDir") ?? undefined,
  });

  const page = parseResult.success ? parseResult.data.page : 1;
  const query = parseResult.success ? (parseResult.data.query ?? null) : null;
  const sortBy = parseResult.success ? parseResult.data.sortBy : "name";
  const sortDir = parseResult.success ? parseResult.data.sortDir : "asc";
  const selectedProcessorId =
    parseResult.success &&
    parseResult.data.processorId !== undefined &&
    processors.some(
      (processor) => processor.id === parseResult.data.processorId,
    )
      ? parseResult.data.processorId
      : null;

  const [restaurantsPage, prefs] = await Promise.all([
    listRestaurantsPage({
      page,
      pageSize: PAGE_SIZE,
      query,
      processorId: selectedProcessorId,
      sortBy,
      sortDir,
    }),
    getUserRestaurantPrefs(user.id),
  ]);

  restaurantsPage.items = restaurantsPage.items.map((restaurant) => ({
    ...restaurant,
    trackState: prefs.get(`${restaurant.processorId}:${restaurant.id}`) ?? null,
  }));

  return {
    processors,
    query,
    sortBy,
    sortDir,
    selectedProcessorId,
    restaurantsPage,
  };
};

export const actions: Actions = {
  toggleTrack: async (event) => {
    const { user } = await requirePermission(event, { competition: ["view"] });

    if (!user) {
      redirect(302, "/login");
    }

    const formData = await event.request.formData();
    const parseResult = toggleTrackSchema.safeParse({
      processorId: formData.get("processorId"),
      restaurantId: formData.get("restaurantId"),
      state: formData.get("state") ?? "",
    });

    if (!parseResult.success) {
      return fail(400, { message: "Invalid tracking request." });
    }

    const { processorId, restaurantId, state } = parseResult.data;

    await setRestaurantPref(
      user.id,
      { processorId, restaurantId },
      state === "" ? null : state,
    );

    return { success: true };
  },
};
