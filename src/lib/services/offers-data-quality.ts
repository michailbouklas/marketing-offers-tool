import { z } from "zod";

export const missingOfferPricingFields = [
  "ideal_price",
  "selling_price",
  "fc_perc",
] as const;

export type MissingOfferPricingField =
  (typeof missingOfferPricingFields)[number];

export type LookupOption = {
  id: number;
  name: string;
};

export type CurrentDimOffersValues = {
  channel: string | null;
  category: string | null;
  subcategory: string | null;
  ideal_price: number | null;
  selling_price: number | null;
  fc_perc: number | null;
  mktg_spend: number | null;
};

export type GapFormLoadResponse = {
  dq_id: number;
  trde_item: string;
  item_name: string;
  brand: string;
  item_category: string;
  detected_at: string;
  missing_fields: MissingOfferPricingField[];
  current_dim_offers: CurrentDimOffersValues;
};

export type GapPricingFormData = {
  channel: string;
  category: string;
  subcategory: string;
  ideal_price: string;
  selling_price: string;
  fc_perc: string;
  mktg_spend: string;
  notes: string;
};

export type PendingGapSubmission = {
  id: number;
  dq_id: number;
  item_code: string;
  channel: string;
  category: string;
  subcategory: string;
  ideal_price: string;
  selling_price: string;
  fc_perc: string;
  mktg_spend: string | null;
  notes: string | null;
  submitted_by: string;
  submitted_at: string;
  status: "pending";
};

export type PendingSubmissionQueueItem = PendingGapSubmission & {
  item_name: string;
  brand: string;
  item_category: string;
  detected_at: string;
  missing_fields: MissingOfferPricingField[];
  current_dim_offers: CurrentDimOffersValues;
};

export type GapListItem = {
  dq_id: number;
  trde_item: string;
  item_name: string;
  brand: string;
  item_category: string;
  detected_at: string;
  status: "open" | "submitted" | "resolved";
  missing_fields: string[];
};

export type GapListPage = {
  items: GapListItem[];
  totalItems: number;
  /** Submitted gaps awaiting approval under the current brand filter (all pages). */
  submittedCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export const gapListSortFields = [
  "item_name",
  "brand",
  "item_category",
  "missing_fields",
  "status",
  "detected_at",
] as const;

export const gapListSortDirections = ["asc", "desc"] as const;

export type GapListSortField = (typeof gapListSortFields)[number];
export type GapListSortDirection = (typeof gapListSortDirections)[number];

export const gapListItemSchema = z.object({
  dq_id: z.number().int().nonnegative(),
  trde_item: z.string(),
  item_name: z.string(),
  brand: z.string(),
  item_category: z.string(),
  detected_at: z.string(),
  status: z.enum(["open", "submitted", "resolved"]),
  missing_fields: z.array(z.string()),
});

export const gapListPageSchema = z.object({
  items: z.array(gapListItemSchema),
  totalItems: z.number().int().nonnegative(),
  submittedCount: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().positive(),
});

export const gapQueueResponseSchema = z.object({
  gapsPage: gapListPageSchema,
  selectedBrandAliases: z.array(z.string()),
  sortBy: z.enum(gapListSortFields),
  sortDir: z.enum(gapListSortDirections),
});

export type GapQueueResponse = z.infer<typeof gapQueueResponseSchema>;

export const pendingSubmissionDecisionSchema = z.enum(["approve", "reject"]);

export type PendingSubmissionDecision = z.infer<
  typeof pendingSubmissionDecisionSchema
>;

export const bulkPendingSubmissionDecisionSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1),
  decision: pendingSubmissionDecisionSchema,
});

export type BulkPendingSubmissionDecision = z.infer<
  typeof bulkPendingSubmissionDecisionSchema
>;

export type BulkPendingSubmissionDecisionResult = {
  decision: PendingSubmissionDecision;
  processedIds: number[];
  failed: Array<{
    id: number;
    error: string;
  }>;
};

export type SubmitGapPricingPayload = {
  channel: string;
  category: string;
  subcategory: string;
  ideal_price: number;
  selling_price: number;
  fc_perc: number;
  mktg_spend: number | null;
  notes: string;
};

export const gapRouteParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const categorySearchParamsSchema = z.object({
  category_id: z.coerce.number().int().positive(),
});

const numericInput = z.coerce.number();
const optionalText = z.string().trim().default("");

export const gapPricingFormSchema = z
  .object({
    channel: z.string().trim().min(1, "Channel is required"),
    category: z.string().trim().min(1, "Category is required"),
    subcategory: z.string().trim().min(1, "Subcategory is required"),
    ideal_price: z
      .union([z.string(), z.number()])
      .transform(normalizeNumericTextInput)
      .refine((value) => (parseOptionalNumberString(value) ?? 0) > 0, {
        message: "Ideal price must be greater than 0",
      }),
    selling_price: z
      .union([z.string(), z.number()])
      .transform(normalizeNumericTextInput)
      .refine((value) => (parseOptionalNumberString(value) ?? -1) >= 0, {
        message: "Selling price must be greater than or equal to 0",
      }),
    fc_perc: z
      .union([z.string(), z.number()])
      .transform(normalizeNumericTextInput)
      .refine((value) => {
        const parsed = parseOptionalNumberString(value);

        return parsed !== null && parsed >= 0 && parsed <= 100;
      }, "Food cost % must be between 0 and 100"),
    mktg_spend: z
      .union([z.string(), z.number(), z.undefined()])
      .transform((value) =>
        value === undefined ? "" : normalizeNumericTextInput(value),
      )
      .refine(
        (value) =>
          value === "" || (parseOptionalNumberString(value) ?? -1) >= 0,
        "Marketing spend cannot be negative",
      ),
    notes: z.string().max(500, "Notes cannot exceed 500 characters"),
  })
  .refine(
    (data) => {
      const idealPrice = parseOptionalNumberString(data.ideal_price);
      const sellingPrice = parseOptionalNumberString(data.selling_price);

      if (idealPrice === null || sellingPrice === null) {
        return true;
      }

      return sellingPrice <= idealPrice;
    },
    {
      message: "Selling price cannot exceed ideal price",
      path: ["selling_price"],
    },
  );

export const submitGapPricingSchema = z
  .object({
    channel: z.string().trim().min(1, "Channel is required"),
    category: z.string().trim().min(1, "Category is required"),
    subcategory: z.string().trim().min(1, "Subcategory is required"),
    ideal_price: numericInput.gt(0, "Ideal price must be greater than 0"),
    selling_price: numericInput.gte(
      0,
      "Selling price must be greater than or equal to 0",
    ),
    fc_perc: numericInput
      .gte(0, "Food cost % must be between 0 and 100")
      .lte(1, "Food cost % must be between 0 and 100"),
    mktg_spend: z.preprocess((value) => {
      if (value === null || value === undefined) {
        return null;
      }

      if (typeof value === "string" && value.trim() === "") {
        return null;
      }

      return value;
    }, numericInput.gte(0, "Marketing spend cannot be negative").nullable()),
    notes: z
      .string()
      .trim()
      .max(500, "Notes cannot exceed 500 characters")
      .default(""),
  })
  .refine((data) => data.selling_price <= data.ideal_price, {
    message: "Selling price cannot exceed ideal price",
    path: ["selling_price"],
  });

export type SubmitGapPricingFormData = z.infer<typeof submitGapPricingSchema>;

export function getDefaultGapPricingFormData(): GapPricingFormData {
  return {
    channel: "",
    category: "",
    subcategory: "",
    ideal_price: "",
    selling_price: "",
    fc_perc: "",
    mktg_spend: "",
    notes: "",
  };
}

export function applyGapPricingLookupDefaults(
  formData: GapPricingFormData,
  options: {
    channels: LookupOption[];
    categories: LookupOption[];
    subcategories: LookupOption[];
  },
): GapPricingFormData {
  const channel = formData.channel || options.channels[0]?.name || "";
  const category = formData.category || options.categories[0]?.name || "";
  const subcategory =
    formData.subcategory &&
    options.subcategories.some((option) => option.name === formData.subcategory)
      ? formData.subcategory
      : options.subcategories[0]?.name || "";

  return {
    ...formData,
    channel,
    category,
    subcategory,
  };
}

export function mapGapLoadResponseToGapPricingFormData(
  response: GapFormLoadResponse,
): GapPricingFormData {
  const missingFields = new Set(response.missing_fields);

  return {
    channel: response.current_dim_offers.channel ?? "",
    category: response.current_dim_offers.category ?? "",
    subcategory: response.current_dim_offers.subcategory ?? "",
    ideal_price: missingFields.has("ideal_price")
      ? ""
      : formatInputNumber(response.current_dim_offers.ideal_price),
    selling_price: missingFields.has("selling_price")
      ? ""
      : formatInputNumber(response.current_dim_offers.selling_price),
    fc_perc: missingFields.has("fc_perc")
      ? ""
      : formatInputNumber(response.current_dim_offers.fc_perc, 100),
    mktg_spend: formatInputNumber(response.current_dim_offers.mktg_spend),
    notes: "",
  };
}

export function mapGapPricingFormToPayload(
  formData: GapPricingFormData,
): SubmitGapPricingPayload {
  return {
    channel: formData.channel,
    category: formData.category,
    subcategory: formData.subcategory,
    ideal_price: Number.parseFloat(formData.ideal_price),
    selling_price: Number.parseFloat(formData.selling_price),
    fc_perc: Number.parseFloat(formData.fc_perc) / 100,
    mktg_spend:
      formData.mktg_spend.trim() === ""
        ? null
        : Number.parseFloat(formData.mktg_spend),
    notes: formData.notes,
  };
}

export function parseMissingFields(value: string): MissingOfferPricingField[] {
  const validFields = new Set<string>(missingOfferPricingFields);

  return value
    .split(",")
    .map((field) => field.trim())
    .filter((field): field is MissingOfferPricingField =>
      validFields.has(field),
    );
}

export function getMissingFieldsFromCurrentValues(
  values: CurrentDimOffersValues,
): MissingOfferPricingField[] {
  const missingFields: MissingOfferPricingField[] = [];

  if (values.ideal_price === null || values.ideal_price === 0) {
    missingFields.push("ideal_price");
  }

  if (values.selling_price === null) {
    missingFields.push("selling_price");
  }

  if (values.fc_perc === null || values.fc_perc === 0) {
    missingFields.push("fc_perc");
  }

  return missingFields;
}

export function getBrandAliases(brands: { alias: string }[]) {
  return brands
    .map((brand) => brand.alias.trim())
    .filter((alias): alias is string => alias.length > 0);
}

export function getSelectedBrandAliases(
  requestedAliases: string[],
  brands: { alias: string }[],
) {
  const allowedAliases = getBrandAliases(brands);
  const allowedAliasSet = new Set(allowedAliases);
  const selectedAliases = Array.from(
    new Set(
      requestedAliases
        .map((alias) => alias.trim())
        .filter((alias) => allowedAliasSet.has(alias)),
    ),
  );

  return selectedAliases.length > 0 ? selectedAliases : allowedAliases;
}

export function formatPricingDecimal(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return value.toFixed(2);
}

export function formatFractionalDecimal(value: number) {
  return value.toFixed(4);
}

export function normalizeMoneyInput(value: string | number) {
  return normalizeFixedDecimalInput(value, 2);
}

export function normalizePercentInput(value: string | number) {
  return normalizeFixedDecimalInput(value, 2);
}

export function getZodFieldErrors(error: z.ZodError) {
  const flattened = error.flatten().fieldErrors;

  return Object.fromEntries(
    Object.entries(flattened)
      .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]))
      .map(([key, messages]) => [key, messages[0]]),
  );
}

function parseOptionalNumberString(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const parsed = Number.parseFloat(trimmedValue);

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNumericTextInput(value: string | number) {
  return typeof value === "number" ? value.toString() : value.trim();
}

function normalizeFixedDecimalInput(value: string | number, digits: number) {
  const normalizedValue = normalizeNumericTextInput(value);
  const parsed = parseOptionalNumberString(normalizedValue);

  if (parsed === null) {
    return normalizedValue;
  }

  return parsed.toFixed(digits);
}

function formatInputNumber(value: number | null, multiplier = 1) {
  if (value === null) {
    return "";
  }

  const scaledValue = value * multiplier;
  const fixedValue = scaledValue.toFixed(multiplier === 100 ? 2 : 2);

  return fixedValue.replace(/\.00$/, "").replace(/(\.\d*[1-9])0$/, "$1");
}
