import { requirePermission } from "$lib/server/auth-guards";
import {
  competitionSortDirections,
  offerSortFields,
} from "$lib/services/competition/competition";
import { listActiveOffersPage } from "$lib/services/competition/offers.server";
import { listProcessors } from "$lib/services/competition/processors.server";
import { z } from "zod";
import type { PageServerLoad } from "./$types";

const PAGE_SIZE = 50;

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

// GET form submits include untouched fields as empty strings (e.g. `from=`),
// so every optional field must treat "" as "not set" — otherwise one empty
// param fails the combined safeParse and silently drops ALL filters.
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

const optionalDay = z.preprocess(
  emptyToUndefined,
  z.string().regex(dayPattern).optional(),
);

const searchParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1).catch(1),
  processorId: optionalPositiveInt.catch(undefined),
  restaurant: optionalTrimmedString.catch(undefined),
  from: optionalDay.catch(undefined),
  to: optionalDay.catch(undefined),
  sortBy: z.enum(offerSortFields).default("created_at").catch("created_at"),
  sortDir: z.enum(competitionSortDirections).default("desc").catch("desc"),
});

/** Day after `day` (UTC) so an inclusive end date becomes an exclusive bound. */
function exclusiveUpperBound(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);

  return date.toISOString().slice(0, 10);
}

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { competition: ["view"] });

  const processors = await listProcessors();
  const parseResult = searchParamsSchema.safeParse({
    page: event.url.searchParams.get("page") ?? 1,
    processorId: event.url.searchParams.get("processorId") ?? undefined,
    restaurant: event.url.searchParams.get("restaurant") ?? undefined,
    from: event.url.searchParams.get("from") ?? undefined,
    to: event.url.searchParams.get("to") ?? undefined,
    sortBy: event.url.searchParams.get("sortBy") ?? undefined,
    sortDir: event.url.searchParams.get("sortDir") ?? undefined,
  });

  const page = parseResult.success ? parseResult.data.page : 1;
  const restaurantQuery = parseResult.success
    ? (parseResult.data.restaurant ?? null)
    : null;
  const from = parseResult.success ? (parseResult.data.from ?? null) : null;
  const to = parseResult.success ? (parseResult.data.to ?? null) : null;
  const sortBy = parseResult.success ? parseResult.data.sortBy : "created_at";
  const sortDir = parseResult.success ? parseResult.data.sortDir : "desc";
  const selectedProcessorId =
    parseResult.success &&
    parseResult.data.processorId !== undefined &&
    processors.some(
      (processor) => processor.id === parseResult.data.processorId,
    )
      ? parseResult.data.processorId
      : null;

  return {
    processors,
    restaurantQuery,
    from,
    to,
    sortBy,
    sortDir,
    selectedProcessorId,
    offersPage: await listActiveOffersPage({
      page,
      pageSize: PAGE_SIZE,
      processorId: selectedProcessorId,
      restaurantQuery,
      from,
      to: to ? exclusiveUpperBound(to) : null,
      sortBy,
      sortDir,
    }),
  };
};
