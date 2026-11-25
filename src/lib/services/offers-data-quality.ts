import { z } from "zod";
import { csvField } from "$lib/services/management-accounts";

export const missingOfferPricingFields = [
  "ideal_price",
  "selling_price",
  "fc_perc",
  "fc_eur",
] as const;

/**
 * VAT on menu prices. The only factor between a shelf (VAT-inclusive) price
 * and ex-VAT net sales; every FC %, margin and CM is measured on ex VAT.
 */
export const VAT_FACTOR = 1.05;

/**
 * Ideal price = (FC EUR / brand ideal FC %) x 1.05 VAT x 1.07 pricing buffer,
 * as specified by marketing. The buffer is not a tax: never divide a shelf
 * price by it. Keep them here so the client preview and the server write use
 * the same numbers.
 */
export const IDEAL_PRICE_MARKUP_FACTORS = [VAT_FACTOR, 1.07] as const;

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
  fc_eur: number | null;
  mktg_spend: number | null;
};

/** The Postgres brand matched to the gap's ClickHouse brand alias. */
export type GapBrandPricingTarget = {
  brand_id: number;
  brand_name: string;
  /** Fraction (0.30 = 30%); null until an admin sets it on the brand page. */
  ideal_fc_perc: number | null;
};

export type GapFormLoadResponse = {
  dq_id: number;
  trde_item: string;
  item_name: string;
  brand: string;
  item_category: string;
  detected_at: string;
  /** Only "open" gaps accept a submission. */
  status: "open" | "submitted" | "resolved" | "dismissed";
  missing_fields: MissingOfferPricingField[];
  current_dim_offers: CurrentDimOffersValues;
  /** null when no Postgres brand matches the gap's brand alias. */
  brand_target: GapBrandPricingTarget | null;
};

export type GapPricingFormData = {
  channel: string;
  category: string;
  subcategory: string;
  /** Derived from fc_eur and brand_ideal_fc_perc; display only. */
  ideal_price: string;
  selling_price: string;
  fc_perc: string;
  fc_eur: string;
  /** Percent text (30 = 30%), prefilled from the brand and read-only. */
  brand_ideal_fc_perc: string;
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
  /** Null on submissions made before FC EUR existed. */
  fc_eur: string | null;
  /** Percent text (30.00); null on legacy submissions. */
  brand_ideal_fc_perc: string | null;
  mktg_spend: string | null;
  notes: string | null;
  submitted_by: string;
  submitted_at: string;
  status: "pending";
  /** Selling price above ideal price. */
  flagged: boolean;
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
  filterOptions: z.object({
    channels: z.array(z.string()),
    stores: z.array(z.object({ store: z.string(), city: z.string() })),
    cities: z.array(z.string()),
  }),
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
  fc_eur: number;
  selling_price: number;
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

export const gapPricingFormSchema = z.object({
  channel: z.string().trim().min(1, "Channel is required"),
  category: z.string().trim().min(1, "Category is required"),
  subcategory: z.string().trim().min(1, "Subcategory is required"),
  ideal_price: z
    .union([z.string(), z.number(), z.undefined()])
    .transform((value) =>
      value === undefined ? "" : normalizeNumericTextInput(value),
    ),
  fc_eur: z
    .union([z.string(), z.number()])
    .transform(normalizeNumericTextInput)
    .refine((value) => (parseOptionalNumberString(value) ?? 0) > 0, {
      message: "FC EUR must be greater than 0",
    }),
  brand_ideal_fc_perc: z
    .union([z.string(), z.number()])
    .transform(normalizeNumericTextInput)
    .refine((value) => {
      const parsed = parseOptionalNumberString(value);

      return parsed !== null && parsed > 0 && parsed <= 100;
    }, "No Brand Ideal FC % is set for this brand. Ask an admin to set it on the brand page."),
  selling_price: z
    .union([z.string(), z.number()])
    .transform(normalizeNumericTextInput)
    .refine((value) => (parseOptionalNumberString(value) ?? 0) > 0, {
      message: "Selling price must be greater than 0 (FC % is derived from it)",
    }),
  // Derived from fc_eur + selling_price; deep discounts legitimately exceed 100%.
  fc_perc: z
    .union([z.string(), z.number()])
    .transform(normalizeNumericTextInput)
    .refine((value) => {
      const parsed = parseOptionalNumberString(value);

      return parsed !== null && parsed > 0 && parsed < 1000;
    }, "FC % is derived from FC € and Selling price"),
  mktg_spend: z
    .union([z.string(), z.number(), z.undefined()])
    .transform((value) =>
      value === undefined ? "" : normalizeNumericTextInput(value),
    )
    .refine(
      (value) => value === "" || (parseOptionalNumberString(value) ?? -1) >= 0,
      "Marketing spend cannot be negative",
    ),
  notes: z.string().max(500, "Notes cannot exceed 500 characters"),
});

/** Selling above ideal is allowed but flags the submission for review. */
export function isPriceAboveIdeal(
  sellingPriceText: string,
  idealPriceText: string,
): boolean {
  const selling = parseOptionalNumberString(sellingPriceText);
  const ideal = parseOptionalNumberString(idealPriceText);

  return selling !== null && ideal !== null && selling > ideal;
}

/**
 * Server payload. `ideal_price` is deliberately absent: the API derives it
 * from `fc_eur` and the brand's target so the stored value always follows the
 * formula. The selling <= ideal check happens in the route once the brand
 * target is known.
 */
export const submitGapPricingSchema = z.object({
  channel: z.string().trim().min(1, "Channel is required"),
  category: z.string().trim().min(1, "Category is required"),
  subcategory: z.string().trim().min(1, "Subcategory is required"),
  fc_eur: numericInput.gt(0, "FC EUR must be greater than 0"),
  selling_price: numericInput.gt(0, "Selling price must be greater than 0"),
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
});

export type SubmitGapPricingFormData = z.infer<typeof submitGapPricingSchema>;

/**
 * Ideal price = (FC EUR / brand ideal FC fraction) x 1.05 x 1.07, rounded to
 * cents. Returns null when either input is missing or not positive.
 */
export function calculateIdealPrice(
  fcEur: number | null | undefined,
  brandIdealFcFraction: number | null | undefined,
): number | null {
  if (
    fcEur === null ||
    fcEur === undefined ||
    brandIdealFcFraction === null ||
    brandIdealFcFraction === undefined ||
    !Number.isFinite(fcEur) ||
    !Number.isFinite(brandIdealFcFraction) ||
    fcEur <= 0 ||
    brandIdealFcFraction <= 0
  ) {
    return null;
  }

  const rawPrice = IDEAL_PRICE_MARKUP_FACTORS.reduce(
    (price, factor) => price * factor,
    fcEur / brandIdealFcFraction,
  );

  // Round to cents after squashing binary noise (11.235 is stored as
  // 11.234999...), so x.xx5 rounds up like a spreadsheet would.
  return Math.round(Math.round(rawPrice * 1e8) / 1e6) / 100;
}

/** Form-text variant: FC EUR text + brand FC as a percent string (30 = 30%). */
export function calculateIdealPriceFromFormValues(
  fcEurText: string,
  brandIdealFcPercentText: string,
): number | null {
  const fcEur = parseOptionalNumberString(fcEurText);
  const brandIdealFcPercent = parseOptionalNumberString(
    brandIdealFcPercentText,
  );

  if (fcEur === null || brandIdealFcPercent === null) {
    return null;
  }

  return calculateIdealPrice(fcEur, brandIdealFcPercent / 100);
}

/**
 * FC fraction = FC EUR / (selling price / 1.05 / 1.07), rounded to 4 dp (the
 * Decimal(5,4) column). At selling = ideal price it equals the brand target.
 * Null when either input is missing or not positive.
 */
export function calculateFcPerc(
  fcEur: number | null | undefined,
  sellingPrice: number | null | undefined,
): number | null {
  if (
    fcEur === null ||
    fcEur === undefined ||
    sellingPrice === null ||
    sellingPrice === undefined ||
    !Number.isFinite(fcEur) ||
    !Number.isFinite(sellingPrice) ||
    fcEur <= 0 ||
    sellingPrice <= 0
  ) {
    return null;
  }

  const netPrice = IDEAL_PRICE_MARKUP_FACTORS.reduce(
    (price, factor) => price / factor,
    sellingPrice,
  );

  return Math.round(Math.round((fcEur / netPrice) * 1e8) / 1e4) / 1e4;
}

/** Form-text variant: "" when it cannot be evaluated, otherwise percent "30.00". */
export function formatFcPercInput(
  fcEurText: string,
  sellingPriceText: string,
): string {
  const fcPerc = calculateFcPerc(
    parseOptionalNumberString(fcEurText),
    parseOptionalNumberString(sellingPriceText),
  );

  return fcPerc === null ? "" : (fcPerc * 100).toFixed(2);
}

/** "" when the formula cannot be evaluated, otherwise "12.34". */
export function formatIdealPriceInput(
  fcEurText: string,
  brandIdealFcPercentText: string,
): string {
  const idealPrice = calculateIdealPriceFromFormValues(
    fcEurText,
    brandIdealFcPercentText,
  );

  return idealPrice === null ? "" : idealPrice.toFixed(2);
}

export function getDefaultGapPricingFormData(): GapPricingFormData {
  return {
    channel: "",
    category: "",
    subcategory: "",
    ideal_price: "",
    selling_price: "",
    fc_perc: "",
    fc_eur: "",
    brand_ideal_fc_perc: "",
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
  const fcEur = missingFields.has("fc_eur")
    ? ""
    : formatInputNumber(response.current_dim_offers.fc_eur);
  const sellingPrice = missingFields.has("selling_price")
    ? ""
    : formatInputNumber(response.current_dim_offers.selling_price);
  const brandIdealFcPerc = formatInputNumber(
    response.brand_target?.ideal_fc_perc ?? null,
    100,
  );

  return {
    channel: response.current_dim_offers.channel ?? "",
    category: response.current_dim_offers.category ?? "",
    subcategory: response.current_dim_offers.subcategory ?? "",
    // Always derived: a stored ideal_price that disagrees with the formula is
    // replaced on the next submission anyway.
    ideal_price: formatIdealPriceInput(fcEur, brandIdealFcPerc),
    selling_price: sellingPrice,
    // Always derived, like ideal_price.
    fc_perc: formatFcPercInput(fcEur, sellingPrice),
    fc_eur: fcEur,
    brand_ideal_fc_perc: brandIdealFcPerc,
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
    fc_eur: Number.parseFloat(formData.fc_eur),
    selling_price: Number.parseFloat(formData.selling_price),
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

  // Rows written before the fc_eur column existed come back without it.
  if (!values.fc_eur) {
    missingFields.push("fc_eur");
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

/** Queue filters beyond brand; every list empty / date unset = no filter. */
export type GapQueueFilters = {
  channels: string[];
  stores: string[];
  cities: string[];
  detectedFrom?: string;
  detectedTo?: string;
};

const isoDateSchema = z.iso.date();
const MAX_FILTER_VALUES = 200;

function listParam(params: URLSearchParams, key: string): string[] {
  return [
    ...new Set(
      params
        .getAll(key)
        .map((value) => value.trim())
        .filter((value) => value.length > 0 && value.length <= 200),
    ),
  ].slice(0, MAX_FILTER_VALUES);
}

function dateParam(params: URLSearchParams, key: string): string | undefined {
  const parsed = isoDateSchema.safeParse(params.get(key) ?? undefined);
  return parsed.success ? parsed.data : undefined;
}

/** Reads `channel` / `store` / `city` (repeatable) and `from` / `to`. Invalid values are dropped. */
export function parseGapQueueFilters(params: URLSearchParams): GapQueueFilters {
  return {
    channels: listParam(params, "channel"),
    stores: listParam(params, "store"),
    cities: listParam(params, "city"),
    detectedFrom: dateParam(params, "from"),
    detectedTo: dateParam(params, "to"),
  };
}

export function appendGapQueueFilters(
  params: URLSearchParams,
  filters: GapQueueFilters,
) {
  for (const channel of filters.channels) params.append("channel", channel);
  for (const store of filters.stores) params.append("store", store);
  for (const city of filters.cities) params.append("city", city);
  if (filters.detectedFrom) params.set("from", filters.detectedFrom);
  if (filters.detectedTo) params.set("to", filters.detectedTo);
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

/** One approved submission (a row of dim_offers_staging), as shown and exported. */
export type ApprovedOffer = {
  id: number;
  trde_item: string;
  item_name: string;
  brand: string;
  channel: string;
  category: string;
  subcategory: string;
  /** Null on submissions made before FC EUR existed. */
  fc_eur: string | null;
  /** Percent text (30.00); null on legacy submissions. */
  brand_ideal_fc_perc: string | null;
  ideal_price: string;
  selling_price: string;
  /** Percent text (30.00). */
  fc_perc: string;
  mktg_spend: string | null;
  notes: string | null;
  submitted_by_name: string;
  submitted_at: string;
  approved_by_name: string | null;
  approved_at: string | null;
};

export const approvedOffersCsvHeader = [
  "Item code",
  "Item",
  "Brand",
  "Channel",
  "Category",
  "Subcategory",
  "FC EUR",
  "Brand ideal FC %",
  "Ideal price",
  "Selling price",
  "FC %",
  "Marketing spend",
  "Notes",
  "Submitted by",
  "Submitted on",
  "Approved by",
  "Approved on",
].join(",");

/** One CSV line per approved offer, columns as in approvedOffersCsvHeader. Dates are ISO days. */
export function approvedOfferCsvLine(offer: ApprovedOffer): string {
  return [
    offer.trde_item,
    offer.item_name,
    offer.brand,
    offer.channel,
    offer.category,
    offer.subcategory,
    offer.fc_eur ?? "",
    offer.brand_ideal_fc_perc ?? "",
    offer.ideal_price,
    offer.selling_price,
    offer.fc_perc,
    offer.mktg_spend ?? "",
    offer.notes ?? "",
    offer.submitted_by_name,
    offer.submitted_at.slice(0, 10),
    offer.approved_by_name ?? "",
    offer.approved_at?.slice(0, 10) ?? "",
  ]
    .map(csvField)
    .join(",");
}

/** One approved submission, as numbers, for summarizeApprovedOffers. Percentages are fractions. */
export type ApprovedOfferAnalyticsRow = {
  brand: string;
  channel: string;
  category: string;
  subcategory: string;
  fc_eur: number | null;
  brand_ideal_fc_perc: number | null;
  ideal_price: number;
  selling_price: number;
  fc_perc: number;
  submitted_by: string;
  submitted_at: Date;
  approved_by: string | null;
  approved_at: Date | null;
};

export type ApprovedOffersMixRow = {
  label: string;
  approved: number;
  /** Average % below the ideal price; null when no row has both prices. */
  avgDiscountPct: number | null;
};

export type ApprovedOffersAnalytics = {
  total: number;
  medianHoursToApprove: number | null;
  selfApproved: number;
  problems: {
    /** Rows with at least one of the problems below. */
    any: number;
    noFcEur: number;
    zeroSellingPrice: number;
    /** Stored FC % differs from the one recomputed from FC EUR and selling price. */
    fcPercMismatch: number;
    unknownChannel: number;
  };
  brands: (ApprovedOffersMixRow & {
    /** Rows that can be checked against the target: FC EUR, target and a selling price. */
    checkable: number;
    /** Average FC % points above the brand target, over the checkable rows. */
    avgPointsOverTarget: number | null;
    overWarn: number;
    overHigh: number;
    aboveIdeal: number;
  })[];
  categories: ApprovedOffersMixRow[];
  channels: ApprovedOffersMixRow[];
  months: { month: string; approved: number }[];
  approvers: { approver: string; approved: number; selfApproved: number }[];
};

/** FC % points above the brand target that count as over / well over. */
export const FC_OVER_TARGET_WARN_POINTS = 5;
export const FC_OVER_TARGET_HIGH_POINTS = 10;
/** Stored and recomputed FC % further apart than this (fraction) count as a mismatch. */
const FC_PERC_MISMATCH_TOLERANCE = 0.006;

function groupRows<T>(rows: T[], key: (row: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const label = key(row);
    const group = groups.get(label);
    if (group) {
      group.push(row);
    } else {
      groups.set(label, [row]);
    }
  }
  return [...groups].sort((a, b) => b[1].length - a[1].length);
}

function average(values: number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** % below the ideal price. Rows with a selling price of 0 are data errors, not 100% discounts. */
function discountPct(row: ApprovedOfferAnalyticsRow): number | null {
  return row.ideal_price > 0 && row.selling_price > 0
    ? (1 - row.selling_price / row.ideal_price) * 100
    : null;
}

/** FC % points above the brand target, recomputed: the stored fc_perc is not reliable. */
function pointsOverTarget(row: ApprovedOfferAnalyticsRow): number | null {
  const fcPerc = calculateFcPerc(row.fc_eur, row.selling_price);
  return fcPerc === null || row.brand_ideal_fc_perc === null
    ? null
    : (fcPerc - row.brand_ideal_fc_perc) * 100;
}

function mixRow(
  label: string,
  rows: ApprovedOfferAnalyticsRow[],
): ApprovedOffersMixRow {
  return {
    label,
    approved: rows.length,
    avgDiscountPct: average(
      rows.map(discountPct).filter((value) => value !== null),
    ),
  };
}

/** Everything the approved-offers Analytics dialog shows, from the filtered rows. */
export function summarizeApprovedOffers(
  rows: ApprovedOfferAnalyticsRow[],
  knownChannels: string[],
): ApprovedOffersAnalytics {
  const channels = new Set(knownChannels);
  const problems = {
    any: 0,
    noFcEur: 0,
    zeroSellingPrice: 0,
    fcPercMismatch: 0,
    unknownChannel: 0,
  };

  for (const row of rows) {
    const fcPerc = calculateFcPerc(row.fc_eur, row.selling_price);
    const found = {
      noFcEur: row.fc_eur === null,
      zeroSellingPrice: row.selling_price <= 0,
      fcPercMismatch:
        fcPerc !== null &&
        Math.abs(fcPerc - row.fc_perc) >= FC_PERC_MISMATCH_TOLERANCE,
      unknownChannel: !channels.has(row.channel),
    };
    for (const key of Object.keys(found) as (keyof typeof found)[]) {
      if (found[key]) problems[key] += 1;
    }
    if (Object.values(found).some(Boolean)) problems.any += 1;
  }

  const hours = rows
    .flatMap((row) =>
      row.approved_at
        ? [(row.approved_at.getTime() - row.submitted_at.getTime()) / 3.6e6]
        : [],
    )
    .sort((a, b) => a - b);
  const middle = Math.floor(hours.length / 2);

  return {
    total: rows.length,
    medianHoursToApprove:
      hours.length === 0
        ? null
        : hours.length % 2
          ? hours[middle]
          : (hours[middle - 1] + hours[middle]) / 2,
    selfApproved: rows.filter((row) => row.submitted_by === row.approved_by)
      .length,
    problems,
    brands: groupRows(rows, (row) => row.brand).map(([label, group]) => {
      const points = group.map(pointsOverTarget).filter((v) => v !== null);
      return {
        ...mixRow(label, group),
        checkable: points.length,
        avgPointsOverTarget: average(points),
        overWarn: points.filter((v) => v > FC_OVER_TARGET_WARN_POINTS).length,
        overHigh: points.filter((v) => v > FC_OVER_TARGET_HIGH_POINTS).length,
        aboveIdeal: group.filter((row) => row.selling_price > row.ideal_price)
          .length,
      };
    }),
    categories: groupRows(
      rows,
      (row) => `${row.category} / ${row.subcategory}`,
    ).map(([label, group]) => mixRow(label, group)),
    channels: groupRows(rows, (row) => row.channel).map(([label, group]) =>
      mixRow(label, group),
    ),
    months: groupRows(
      rows.filter((row) => row.approved_at),
      (row) => row.approved_at!.toISOString().slice(0, 7),
    )
      .map(([month, group]) => ({ month, approved: group.length }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    approvers: groupRows(
      rows.filter((row) => row.approved_by),
      (row) => row.approved_by!,
    ).map(([approver, group]) => ({
      approver,
      approved: group.length,
      selfApproved: group.filter((row) => row.submitted_by === approver).length,
    })),
  };
}

/** Lifetime POS sales of one offer code, from the /sales/offers cache. */
export type OfferSales = {
  units: number;
  /** Net EUR of every line of the offer. */
  offerNet: number;
  daysOnSale: number;
  /** ISO day. */
  lastSale: string;
};

/** Key of an offer in a sales map: brand alias + item code. */
export function offerSalesKey(brand: string, code: string): string {
  return `${brand.trim().toLowerCase()}|${code}`;
}

/** A charged price further than this from the approved price (fraction) is a mismatch. */
export const PRICE_MISMATCH_TOLERANCE = 0.1;
/** A gap counts as selling now when its last sale is within this many days. */
export const LIVE_GAP_DAYS = 30;
/** A gap counts as no longer sold after this many days without a sale. */
export const DEAD_GAP_DAYS = 182;

export type OfferSalesCheckRow = {
  label: string;
  /** Approved offers with POS sales and an approved selling price. */
  sold: number;
  /** Of those, charged more than PRICE_MISMATCH_TOLERANCE away from the approved price. */
  priceMismatch: number;
  /** Offers behind the FC figures: FC EUR, target, and a charged price that matches. */
  checked: number;
  net: number;
  /** Food cost as % of POS net (units x FC EUR / net); null when nothing is checked. */
  realFcPct: number | null;
  targetPct: number | null;
  /** Food cost EUR above what the target allows on that net. */
  eurAboveTarget: number;
};

/**
 * Approved prices against what the POS sold, per brand. Sales are lifetime and
 * FC EUR is the one approved now, so old offers are costed at the current cost.
 */
export function summarizeOfferSales(
  rows: (ApprovedOfferAnalyticsRow & { trde_item: string })[],
  sales: Map<string, OfferSales>,
): OfferSalesCheckRow[] {
  const seen = new Set<string>();
  // An offer approved twice has one set of sales: count it once.
  const unique = rows.filter((row) => {
    const key = offerSalesKey(row.brand, row.trde_item);
    return !seen.has(key) && seen.add(key);
  });

  return groupRows(unique, (row) => row.brand)
    .map(([label, group]) => {
      const result: OfferSalesCheckRow = {
        label,
        sold: 0,
        priceMismatch: 0,
        checked: 0,
        net: 0,
        realFcPct: null,
        targetPct: null,
        eurAboveTarget: 0,
      };
      let cost = 0;
      let allowed = 0;

      for (const row of group) {
        const sold = sales.get(offerSalesKey(row.brand, row.trde_item));
        if (!sold || sold.units <= 0 || sold.offerNet <= 0) continue;
        if (row.selling_price <= 0) continue;
        result.sold += 1;

        const charged = (sold.offerNet / sold.units) * VAT_FACTOR;
        if (
          Math.abs(charged / row.selling_price - 1) > PRICE_MISMATCH_TOLERANCE
        ) {
          result.priceMismatch += 1;
          continue;
        }
        if (row.fc_eur === null || row.brand_ideal_fc_perc === null) continue;

        result.checked += 1;
        result.net += sold.offerNet;
        cost += sold.units * row.fc_eur;
        allowed += sold.offerNet * row.brand_ideal_fc_perc;
      }

      if (result.net > 0) {
        result.realFcPct = (cost / result.net) * 100;
        result.targetPct = (allowed / result.net) * 100;
        result.eurAboveTarget = cost - allowed;
      }
      return result;
    })
    .filter((row) => row.sold > 0)
    .sort((a, b) => b.net - a.net);
}

export type LiveGap = {
  dq_id: number;
  brand: string;
  trde_item: string;
  item_name: string;
  /** Lifetime net / days with a sale. */
  netPerDay: number;
  lifetimeNet: number;
  lastSale: string;
};

export type LiveGaps = {
  /** Unpriced offers sold in the last LIVE_GAP_DAYS, biggest earner first. */
  live: LiveGap[];
  /** Unpriced offers with no sale in DEAD_GAP_DAYS, or none at all. */
  dead: number;
  total: number;
};

/** Splits the unpriced queue into what sells now (ranked) and what no longer sells. */
export function rankLiveGaps(
  gaps: {
    dq_id: number;
    brand: string;
    trde_item: string;
    item_name: string;
  }[],
  sales: Map<string, OfferSales>,
  today: Date,
): LiveGaps {
  const dayBefore = (days: number) =>
    new Date(today.getTime() - days * 864e5).toISOString().slice(0, 10);
  const liveFrom = dayBefore(LIVE_GAP_DAYS);
  const deadBefore = dayBefore(DEAD_GAP_DAYS);
  const live: LiveGap[] = [];
  let dead = 0;

  for (const gap of gaps) {
    const sold = sales.get(offerSalesKey(gap.brand, gap.trde_item));
    if (!sold || sold.lastSale < deadBefore) {
      dead += 1;
    } else if (sold.lastSale >= liveFrom) {
      live.push({
        dq_id: gap.dq_id,
        brand: gap.brand.trim().toUpperCase(),
        trde_item: gap.trde_item,
        item_name: gap.item_name,
        netPerDay: sold.daysOnSale > 0 ? sold.offerNet / sold.daysOnSale : 0,
        lifetimeNet: sold.offerNet,
        lastSale: sold.lastSale,
      });
    }
  }

  return {
    live: live.sort((a, b) => b.netPerDay - a.netPerDay),
    dead,
    total: gaps.length,
  };
}
