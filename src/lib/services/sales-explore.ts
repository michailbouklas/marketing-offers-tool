/**
 * Shared column list + request schemas for /sales/explore (browser-safe).
 * The SQL for each column lives server-side in `sales-explore.server.ts`;
 * a column id is the only thing the client may name.
 */
import { z } from "zod";

export type ExploreColumnKind = "text" | "number" | "date";

export const EXPLORE_COLUMNS = [
  { id: "order_no", label: "Order no.", kind: "number", width: 130 },
  { id: "day", label: "Date", kind: "date", width: 130 },
  { id: "time", label: "Time", kind: "text", width: 110 },
  { id: "brand", label: "Brand", kind: "text", width: 140 },
  { id: "store", label: "Store", kind: "text", width: 220 },
  { id: "channel", label: "Channel", kind: "text", width: 130 },
  { id: "source", label: "Source", kind: "text", width: 120 },
  { id: "division_group", label: "Division group", kind: "text", width: 160 },
  { id: "division", label: "Division", kind: "text", width: 180 },
  { id: "online", label: "Online", kind: "text", width: 120 },
  { id: "payment", label: "Payment", kind: "text", width: 150 },
  { id: "receipt_method", label: "Receipt method", kind: "text", width: 170 },
  { id: "type", label: "Type", kind: "text", width: 110 },
  { id: "net", label: "Net (EUR)", kind: "number", width: 110 },
  { id: "discount", label: "Discount (EUR)", kind: "number", width: 130 },
] as const satisfies readonly {
  id: string;
  label: string;
  kind: ExploreColumnKind;
  width: number;
}[];

export type ExploreColumnId = (typeof EXPLORE_COLUMNS)[number]["id"];
export const EXPLORE_COLUMN_IDS = EXPLORE_COLUMNS.map((column) => column.id);

/** One grid row; `pk` identifies the order for the detail dialog. */
export type ExploreRow = { pk: string } & Record<
  ExploreColumnId,
  string | number
>;

/** `<date>_<location>_<division>_<no>` — the warehouse `transactions.pk`. */
export const ORDER_PK_PATTERN =
  /^(\d{4}-\d{2}-\d{2})_(\d{1,5})_(\d{1,10})_(\d{1,10})$/;

export const EXPLORE_PAGE_MAX_ROWS = 1_000;
export const EXPLORE_VALUES_LIMIT = 200;
/** officecli imports ~100k rows in ~7 s; above this the export is refused. */
export const EXPLORE_EXPORT_MAX_ROWS = 100_000;

const columnId = z.enum(EXPLORE_COLUMN_IDS as [ExploreColumnId]);
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/)
  .transform((value) => value.slice(0, 10));

const textCondition = z.object({
  type: z.literal("text"),
  operator: z.enum([
    "contains",
    "notContains",
    "equals",
    "notEquals",
    "startsWith",
    "endsWith",
    "blank",
    "notBlank",
  ]),
  value: z.string().max(200).optional(),
  /** Set filter (our server-backed popup); serialized from a Set. */
  selectedValues: z
    .array(z.union([z.string(), z.number(), z.null()]))
    .max(1_000)
    .optional(),
  includeBlank: z.boolean().optional(),
});

const numberCondition = z.object({
  type: z.literal("number"),
  operator: z.enum([
    "=",
    "!=",
    ">",
    "<",
    ">=",
    "<=",
    "between",
    "blank",
    "notBlank",
  ]),
  value: z.number().finite().optional(),
  valueTo: z.number().finite().optional(),
});

const dateCondition = z.object({
  type: z.literal("date"),
  operator: z.enum(["=", "!=", ">", "<", "between", "blank", "notBlank"]),
  value: isoDay.optional(),
  valueTo: isoDay.optional(),
});

export const exploreConditionSchema = z.discriminatedUnion("type", [
  textCondition,
  numberCondition,
  dateCondition,
]);
export type ExploreCondition = z.infer<typeof exploreConditionSchema>;

const combination = z.enum(["and", "or"]);

export const exploreFilterSchema = z
  .partialRecord(
    columnId,
    z.object({
      groups: z
        .array(
          z.object({
            conditions: z.array(exploreConditionSchema).max(10),
            combination,
          }),
        )
        .max(10),
      combination,
    }),
  )
  .default({});
export type ExploreFilter = z.infer<typeof exploreFilterSchema>;

export const exploreSortSchema = z
  .array(
    z.object({
      colId: columnId,
      direction: z.enum(["asc", "desc"]).nullable(),
    }),
  )
  .max(5)
  .default([]);
export type ExploreSort = z.infer<typeof exploreSortSchema>;

export const EXPLORE_OFFER_FILTER_MAX_ITEMS = 500;
export const offerFilterModes = ["with", "without", "any", "none"] as const;
export type OfferFilterMode = (typeof offerFilterModes)[number];

export const comboFilterModes = ["only", "exclude"] as const;
export type ComboFilterMode = (typeof comboFilterModes)[number];

/**
 * Offers Assistant filter. `with`/`without` keep/drop orders holding any of
 * `items` (POS item codes); `any`/`none` ignore `items`. `combo` keeps/drops
 * orders holding a meal-deal line; either part may be set alone.
 */
export const offerFilterSchema = z
  .object({
    mode: z.enum(offerFilterModes).optional(),
    items: z
      .array(z.string().min(1).max(64))
      .max(EXPLORE_OFFER_FILTER_MAX_ITEMS)
      .default([]),
    combo: z.enum(comboFilterModes).optional(),
  })
  .refine(
    ({ mode, items }) =>
      (mode !== "with" && mode !== "without") || items.length > 0,
    { message: "Select at least one offer" },
  )
  .refine(({ mode, combo }) => mode !== undefined || combo !== undefined, {
    message: "Pick an offer or combo filter",
  })
  .nullable()
  .optional();
export type OfferFilter = NonNullable<z.infer<typeof offerFilterSchema>>;

export const exploreRowsRequestSchema = z
  .object({
    range: z.object({
      startRow: z.number().int().min(0),
      endRow: z.number().int().min(0),
    }),
    sort: exploreSortSchema,
    filter: exploreFilterSchema,
    offers: offerFilterSchema,
  })
  .refine(
    ({ range }) =>
      range.endRow >= range.startRow &&
      range.endRow - range.startRow <= EXPLORE_PAGE_MAX_ROWS,
    { message: `A page holds at most ${EXPLORE_PAGE_MAX_ROWS} rows` },
  );
export type ExploreRowsRequest = z.infer<typeof exploreRowsRequestSchema>;

export const exploreValuesRequestSchema = z.object({
  colId: columnId,
  search: z.string().max(100).default(""),
  filter: exploreFilterSchema,
  offers: offerFilterSchema,
});
export type ExploreValuesRequest = z.infer<typeof exploreValuesRequestSchema>;

export const exploreExportRequestSchema = z.object({
  sort: exploreSortSchema,
  filter: exploreFilterSchema,
  offers: offerFilterSchema,
});
export type ExploreExportRequest = z.infer<typeof exploreExportRequestSchema>;

export const exploreBreakdownRequestSchema = z.object({
  filter: exploreFilterSchema,
  offers: offerFilterSchema,
  /** Grid selection: only these orders. */
  pks: z
    .array(z.string().regex(ORDER_PK_PATTERN))
    .min(1)
    .max(EXPLORE_PAGE_MAX_ROWS)
    .optional(),
});

export const VALUE_BUCKETS = ["offer", "combo", "other"] as const;
export type ValueBucket = (typeof VALUE_BUCKETS)[number];

/**
 * Where the filtered orders' net came from. Each non-voided line lands in one
 * bucket (offer bundle > meal-deal bundle > other); `discount` is
 * `transactions.tran_discount` (net € given away, on top of net), split per
 * bucket by the net of each order's discounted lines.
 */
export type ExploreValueBreakdown = {
  orders: number;
  orderNet: number;
  /** Sum of line nets (delivery charges excluded); differs slightly from orderNet. */
  lineNet: number;
  discount: number;
  discountOrders: number;
  /** Sum of `tran_total` (net + VAT + delivery + service). */
  paid: number;
  medianNet: number;
  /** Order net of orders holding an offer line (count = buckets.offer.orders). */
  offerOrderNet: number;
  /** Combo + other line net inside those offer orders: spend added to the deal. */
  offerAddOnNet: number;
  buckets: Record<
    ValueBucket,
    { net: number; orders: number; discount: number }
  >;
};

/** Offers Assistant list: offers present in the current (column-filtered) data. */
export const exploreOfferOptionsRequestSchema = z.object({
  search: z.string().max(100).default(""),
  filter: exploreFilterSchema,
});

/** Offer names for the orders of one loaded grid page. */
export const exploreOrderOffersRequestSchema = z.object({
  pks: z.array(z.string().regex(ORDER_PK_PATTERN)).max(EXPLORE_PAGE_MAX_ROWS),
});

/** Selected orders (grid right-click): Excel of their full lines. */
export const exploreOrdersExportRequestSchema = z.object({
  pks: z
    .array(z.string().regex(ORDER_PK_PATTERN))
    .min(1)
    .max(EXPLORE_PAGE_MAX_ROWS),
});

/** Selected orders the Sales Assistant gets in full (lines go in its prompt). */
export const EXPLORE_AI_MAX_ORDERS = 50;

export const EXPLORE_OFFER_OPTIONS_LIMIT = 200;

export type ExploreOfferOption = {
  item: string;
  name: string;
  category: string;
  orders: number;
};

export type ExploreOrderLine = {
  line: number;
  subLine: number;
  item: string;
  name: string;
  category: string;
  qty: number;
  net: number;
  gross: number;
  discount: number;
  coupon: string;
  isCoupon: boolean;
  comboItem: string;
  voided: boolean;
  comment: string;
  /** Offer/coupon header line (see OFFER_LINE_SQL). */
  isOffer: boolean;
  /** Combo / bundle header line (see COMBO_LINE_SQL). */
  isCombo: boolean;
};

export type ExploreOrder = {
  header: Record<ExploreColumnId, string | number> & {
    pk: string;
    receipt: string;
    gross: number;
    vat: number;
    total: number;
  };
  lines: ExploreOrderLine[];
};

/**
 * JSON-safe copy of a gp-grid filter model: Sets become arrays (JSON turns a
 * Set into `{}`) and Dates become the LOCAL calendar day (toISOString would
 * shift a local-midnight date to the previous UTC day).
 */
export function serializeGridFilter(filter: unknown): unknown {
  return JSON.parse(
    JSON.stringify(filter ?? {}, function (key, value) {
      const raw = (this as Record<string, unknown>)[key];
      if (raw instanceof Set) {
        return [...raw];
      }
      if (raw instanceof Date) {
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`;
      }
      return value;
    }),
  );
}

function parseJsonParam(params: URLSearchParams, key: string): unknown {
  try {
    return JSON.parse(params.get(key) ?? "null");
  } catch {
    return null;
  }
}

/** Column + offer filters from the page URL; anything invalid is dropped. */
export function readExploreUrlFilters(params: URLSearchParams): {
  filter: ExploreFilter;
  offers: OfferFilter | null;
} {
  const filter = exploreFilterSchema.safeParse(
    parseJsonParam(params, "filter") ?? undefined,
  );
  const offers = offerFilterSchema.safeParse(parseJsonParam(params, "offers"));
  return {
    filter: filter.success ? filter.data : {},
    offers: offers.success ? (offers.data ?? null) : null,
  };
}

/** Writes (or removes) the `filter` / `offers` params in place. */
export function writeExploreUrlFilters(
  params: URLSearchParams,
  filter: unknown,
  offers: OfferFilter | null,
): void {
  if (filter && Object.keys(filter).length > 0) {
    params.set("filter", JSON.stringify(filter));
  } else {
    params.delete("filter");
  }
  if (offers) params.set("offers", JSON.stringify(offers));
  else params.delete("offers");
}

const OPERATOR_TEXT: Record<string, string> = {
  contains: "contains",
  notContains: "does not contain",
  equals: "is",
  notEquals: "is not",
  startsWith: "starts with",
  endsWith: "ends with",
  blank: "is blank",
  notBlank: "is not blank",
  "=": "=",
  "!=": "≠",
  ">": ">",
  "<": "<",
  ">=": "≥",
  "<=": "≤",
  between: "between",
};

function describeCondition(
  condition: ExploreCondition,
  label: (value: string) => string,
): string {
  if (condition.type === "text" && condition.selectedValues) {
    const values = condition.selectedValues.map((value) =>
      value === null || value === "" ? "(blank)" : label(String(value)),
    );
    return values.length > 3
      ? `${values.slice(0, 2).join(", ")} +${values.length - 2} more`
      : values.join(", ");
  }
  const operator = OPERATOR_TEXT[condition.operator] ?? condition.operator;
  if (condition.operator === "blank" || condition.operator === "notBlank") {
    return operator;
  }
  const value =
    condition.type === "text" ? `"${condition.value ?? ""}"` : condition.value;
  return condition.operator === "between"
    ? `between ${condition.value} and ${condition.valueTo}`
    : `${operator} ${value}`;
}

/** One readable line per filtered column, in column order, for filter chips. */
export function describeExploreFilter(
  filter: unknown,
  labelFor: (colId: string, value: string) => string,
): { colId: ExploreColumnId; label: string; text: string }[] {
  const parsed = exploreFilterSchema.safeParse(filter ?? {});
  if (!parsed.success) return [];
  return EXPLORE_COLUMNS.flatMap((column) => {
    const model = parsed.data[column.id];
    if (!model) return [];
    const text = model.groups
      .map((group) =>
        group.conditions
          .map((c) => describeCondition(c, (v) => labelFor(column.id, v)))
          .join(` ${group.combination} `),
      )
      .filter(Boolean)
      .join(` ${model.combination} `);
    return text ? [{ colId: column.id, label: column.label, text }] : [];
  });
}

/** What the grid last queried: export re-sends exactly this. */
export type ExploreGridState = {
  sort: { colId: string; direction: "asc" | "desc" | null }[];
  filter: unknown;
  offers: OfferFilter | null;
  totalRows: number;
};

/** One offer on an order, as listed in the Offers column. */
export type ExploreOrderOffer = { item: string; name: string };

/** user.meta preference key for the grid's column layout. */
export const EXPLORE_COLUMNS_PREFERENCE = "salesExplore.columns";

/** Saved gp-grid column layout (order, width, pin, hidden) per column. */
export const exploreColumnStateSchema = z
  .array(
    z.object({
      columnId: z.enum(["offers", ...EXPLORE_COLUMN_IDS]),
      width: z.number().int().min(40).max(1_000).nullable().optional(),
      order: z.number().int().min(0).max(100),
      pinned: z.enum(["start", "end"]).nullable(),
      hidden: z.boolean().optional(),
    }),
  )
  .max(30);
export type ExploreColumnState = z.infer<typeof exploreColumnStateSchema>;
