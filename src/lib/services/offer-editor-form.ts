import {
  Aggregator,
  type AggregatorOffer,
  type CreateAggregatorOfferInput,
} from "$lib/services/aggregator-offers";
import { z } from "zod";

const optionalText = z.string().trim().default("");

export const aggregatorOptions = Object.values(Aggregator) as [
  Aggregator,
  ...Aggregator[],
];

export const offerEditorFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    offerId: z.string().trim().min(1, "Offer ID is required"),
    novaseroItemCode: z
      .string()
      .trim()
      .min(1, "Novasero Item Code is required"),
    aggregator: z
      .string()
      .trim()
      .default("")
      .refine(
        (value): value is Aggregator =>
          aggregatorOptions.includes(value as Aggregator),
        "Aggregator is required",
      ),
    brandId: z.string().trim().regex(/^\d+$/, "Brand is required"),
    details: optionalText,
    startsAt: z
      .string()
      .trim()
      .min(1, "Start date is required")
      .refine(isValidDateTimeValue, "Start date must be valid"),
    endsAt: z
      .string()
      .trim()
      .min(1, "End date is required")
      .refine(isValidDateTimeValue, "End date must be valid"),
    active: z.preprocess(
      (value) => value === true || value === "true",
      z.boolean(),
    ),
  })
  .refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
    message: "End date must be after the start date",
    path: ["endsAt"],
  });

export type OfferEditorFormData = z.infer<typeof offerEditorFormSchema>;

export type OfferEditorFormDefaults = Omit<
  OfferEditorFormData,
  "aggregator"
> & {
  aggregator: "" | Aggregator;
};

export type OfferEditorActionMessage = {
  text: string;
  offerId: number;
  mode: "create" | "edit";
  keepOpen?: boolean;
};

export function getDefaultOfferEditorFormData(): OfferEditorFormDefaults {
  return {
    name: "",
    offerId: "",
    novaseroItemCode: "",
    aggregator: "",
    brandId: "",
    details: "",
    startsAt: "",
    endsAt: "",
    active: true,
  };
}

export function mapOfferEditorFormToCreateInput(
  formData: OfferEditorFormData,
): CreateAggregatorOfferInput {
  return {
    name: formData.name,
    offer_id: formData.offerId,
    novasero_item_code: formData.novaseroItemCode,
    aggregator: formData.aggregator,
    brand_id: Number.parseInt(formData.brandId, 10),
    details: formData.details,
    starts_at: new Date(formData.startsAt),
    ends_at: new Date(formData.endsAt),
    active: formData.active,
  };
}

export function mapOfferToEditorFormDefaults(
  offer: AggregatorOffer,
): OfferEditorFormDefaults {
  return {
    name: offer.name,
    offerId: offer.offer_id,
    novaseroItemCode: offer.novasero_item_code,
    aggregator: offer.aggregator,
    brandId: offer.brand.id.toString(),
    details: offer.details,
    startsAt: toDateTimeLocalValue(offer.starts_at),
    endsAt: toDateTimeLocalValue(offer.ends_at),
    active: offer.active,
  };
}

function isValidDateTimeValue(value: string) {
  return !Number.isNaN(new Date(value).getTime());
}

function toDateTimeLocalValue(value: Date) {
  const pad = (part: number) => part.toString().padStart(2, "0");

  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(
    value.getHours(),
  )}:${pad(value.getMinutes())}`;
}
