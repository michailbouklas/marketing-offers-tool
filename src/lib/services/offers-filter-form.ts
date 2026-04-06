import type { AggregatorOffersFilters } from "$lib/services/aggregator-offers";
import { Aggregator } from "../../generated/prisma/enums";
import { z } from "zod";

const emptyString = z.string().trim().default("");
const numericString = z
  .string()
  .trim()
  .regex(/^\d*$/, "ID must be a whole number")
  .default("");
const activeStates = ["all", "active", "inactive"] as const;
const lifecyclePresets = [
  "",
  "active",
  "expiringSoon",
  "recentlyExpired",
] as const;

export const aggregatorOptions = Object.values(Aggregator) as [
  Aggregator,
  ...Aggregator[],
];

export const offersFilterFormSchema = z.object({
  id: numericString,
  offerId: emptyString,
  name: emptyString,
  aggregator: z.union([z.literal(""), z.enum(aggregatorOptions)]).default(""),
  brandId: numericString,
  details: emptyString,
  activeState: z.enum(activeStates).default("all"),
  lifecyclePreset: z.enum(lifecyclePresets).default(""),
  startsFrom: emptyString,
  startsTo: emptyString,
  endsFrom: emptyString,
  endsTo: emptyString,
  createdFrom: emptyString,
  createdTo: emptyString,
  updatedFrom: emptyString,
  updatedTo: emptyString,
});

export type OffersFilterFormData = z.infer<typeof offersFilterFormSchema>;

const filterKeys = [
  "id",
  "offerId",
  "name",
  "aggregator",
  "brandId",
  "details",
  "activeState",
  "lifecyclePreset",
  "startsFrom",
  "startsTo",
  "endsFrom",
  "endsTo",
  "createdFrom",
  "createdTo",
  "updatedFrom",
  "updatedTo",
] as const satisfies readonly (keyof OffersFilterFormData)[];

export function getOffersFilterFormData(url: URL): OffersFilterFormData {
  const values = Object.fromEntries(
    filterKeys.map((key) => [key, url.searchParams.get(key) ?? undefined]),
  );

  const result = offersFilterFormSchema.safeParse(values);

  if (result.success) {
    return result.data;
  }

  return offersFilterFormSchema.parse({});
}

export function mapOffersFilterFormToFilters(
  formData: OffersFilterFormData,
): AggregatorOffersFilters {
  const filters: AggregatorOffersFilters = {
    ...(formData.id ? { id: Number.parseInt(formData.id, 10) } : {}),
    ...(formData.offerId ? { offer_id: formData.offerId } : {}),
    ...(formData.name ? { name: formData.name } : {}),
    ...(formData.aggregator ? { aggregator: formData.aggregator } : {}),
    ...(formData.brandId
      ? { brand_id: Number.parseInt(formData.brandId, 10) }
      : {}),
    ...(formData.details ? { details: formData.details } : {}),
    ...(formData.activeState === "active"
      ? { active: true }
      : formData.activeState === "inactive"
        ? { active: false }
        : {}),
    ...(formData.startsFrom
      ? { starts_after: toStartOfDay(formData.startsFrom) }
      : {}),
    ...(formData.startsTo
      ? { starts_before: toEndOfDay(formData.startsTo) }
      : {}),
    ...(formData.endsFrom
      ? { ends_after: toStartOfDay(formData.endsFrom) }
      : {}),
    ...(formData.endsTo ? { ends_before: toEndOfDay(formData.endsTo) } : {}),
    ...(formData.createdFrom
      ? { created_after: toStartOfDay(formData.createdFrom) }
      : {}),
    ...(formData.createdTo
      ? { created_before: toEndOfDay(formData.createdTo) }
      : {}),
    ...(formData.updatedFrom
      ? { updated_after: toStartOfDay(formData.updatedFrom) }
      : {}),
    ...(formData.updatedTo
      ? { updated_before: toEndOfDay(formData.updatedTo) }
      : {}),
  };

  return applyLifecyclePreset(filters, formData.lifecyclePreset);
}

function applyLifecyclePreset(
  filters: AggregatorOffersFilters,
  lifecyclePreset: OffersFilterFormData["lifecyclePreset"],
) {
  const now = new Date();

  if (lifecyclePreset === "active") {
    return {
      ...filters,
      active: true,
      active_on: now,
    } satisfies AggregatorOffersFilters;
  }

  if (lifecyclePreset === "expiringSoon") {
    const targetDay = addDays(toLocalStartOfDay(now), 2);

    return {
      ...filters,
      active: true,
      active_on: now,
      ends_after: targetDay,
      ends_before: toLocalEndOfDay(targetDay),
    } satisfies AggregatorOffersFilters;
  }

  if (lifecyclePreset === "recentlyExpired") {
    return {
      ...filters,
      ends_after: addDays(toLocalStartOfDay(now), -2),
      ends_before: now,
    } satisfies AggregatorOffersFilters;
  }

  return filters;
}

function toStartOfDay(value: string) {
  return new Date(`${value}T00:00:00.000`);
}

function toEndOfDay(value: string) {
  return new Date(`${value}T23:59:59.999`);
}

function toLocalStartOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toLocalEndOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}
