// Browser-safe types, constants, and formatting helpers for the processed
// aggregator invoices section (`/aggregator-offers/invoices`). Server-only
// Prisma queries live in `invoices.server.ts`.

/**
 * Aggregators whose invoices are ingested into the main Postgres database.
 * Adding a new aggregator = extend this union and register an adapter in
 * `invoices.server.ts`.
 */
export const invoiceAggregators = ["wolt", "bolt"] as const;

export type InvoiceAggregator = (typeof invoiceAggregators)[number];

const invoiceAggregatorLabels: Record<InvoiceAggregator, string> = {
  wolt: "Wolt",
  bolt: "Bolt",
};

export function invoiceAggregatorLabel(value: InvoiceAggregator): string {
  return invoiceAggregatorLabels[value];
}

export const invoiceErpSentValues = ["Y", "N"] as const;

export type InvoiceErpSent = (typeof invoiceErpSentValues)[number];

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

/**
 * One page of invoice headers plus the summed `totalpayout` across ALL
 * invoices matching the filters (not just the visible page).
 */
export type InvoiceHeadersPage = Paginated<InvoiceHeaderRow> & {
  totalPayout: number | null;
};

/**
 * Invoice header unified across aggregators. Shared columns are typed;
 * aggregator-specific columns (WOLT remarks; BOLT scenario, JE dates, ERP
 * comments) are flattened into display-ready `extraFields` so the UI needs no
 * per-aggregator branching. Dates are ISO strings and Decimals plain numbers —
 * mapped server-side so the payload stays serializable.
 */
export type InvoiceHeaderRow = {
  aggregator: InvoiceAggregator;
  documentid: string;
  documentdate: string | null;
  invoicenumber: string | null;
  timeframe: string | null;
  bpcode: string | null;
  bpname: string | null;
  /** WOLT `partnername` / BOLT `bolt_storename`. */
  storeName: string | null;
  distributionrule: string | null;
  project: string | null;
  erpdatabase: string | null;
  totalpayout: number | null;
  createdat: string | null;
  erpsent: string | null;
  erpcreatedat: string | null;
  lineCount: number;
  extraFields: { label: string; value: string }[];
};

export type InvoiceLineRow = {
  documentid: string;
  linenumber: number;
  /** BOLT journal-entry number (part of its composite PK); null for WOLT. */
  jeNumber: number | null;
  transtype: string | null;
  linedetails: string | null;
  amount: number | null;
  vatamount: number | null;
  totalamount: number | null;
  accountcode: string | null;
  vatcode: string | null;
};

export type InvoiceDetail = {
  header: InvoiceHeaderRow;
  lines: InvoiceLineRow[];
};

export type InvoiceStoreSelection = {
  aggregator: InvoiceAggregator;
  storeName: string | null;
  bpname: string | null;
};

export type InvoiceTransactionTypeMetric = {
  transactionType: string | null;
  lineItemCount: number;
  totalAmount: number;
};

export type InvoiceLineDetailsMetric = {
  lineDetails: string | null;
  lineItemCount: number;
  totalAmount: number;
};

export type StoreInvoiceMetrics = {
  invoiceCount: number;
  lineItemCount: number;
  totalInvoiceAmount: number;
  transactionTypes: InvoiceTransactionTypeMetric[];
  lineDetails: InvoiceLineDetailsMetric[];
};

export type InvoicePayoutTrendPoint = {
  /** Bucket start (first day of month, or the day itself), YYYY-MM-DD UTC. */
  period: string;
  invoiceCount: number;
  totalPayout: number;
};

/**
 * Invoice count + payout total over time. Monthly buckets when the data spans
 * at least two months; daily buckets otherwise (e.g. a single-month period
 * filter), so short periods still chart. Zero-filled between the first and
 * last bucket with data.
 */
export type InvoicePayoutTrend = {
  granularity: "month" | "day";
  points: InvoicePayoutTrendPoint[];
};

/**
 * The store-dialog metrics minus the line-details breakdown, computed across
 * ALL invoices matching the page filters — powers the filter-wide Info dialog.
 */
export type InvoiceMetrics = Omit<StoreInvoiceMetrics, "lineDetails"> & {
  payoutTrend: InvoicePayoutTrend;
};

export type InvoiceFilters = {
  aggregator: InvoiceAggregator;
  /** Case-insensitive substring match on `invoicenumber`. */
  invoiceNumber: string | null;
  /** Case-insensitive substring match over BP name + store/partner name. */
  store: string | null;
  erpsent: InvoiceErpSent | null;
  /** Inclusive `documentdate` lower bound, YYYY-MM-DD. */
  from: string | null;
  /** Inclusive `documentdate` upper bound, YYYY-MM-DD. */
  to: string | null;
  /** Headers with at least one line whose `linedetails` matches (ilike %x%). */
  lineDetails: string | null;
  /** Exact-match allowlist for `project`; empty array intentionally yields zero rows. */
  projectCodes?: string[] | null;
};

export const invoiceSortFields = ["documentdate", "totalpayout"] as const;

export type InvoiceSortField = (typeof invoiceSortFields)[number];

export const invoiceSortDirections = ["asc", "desc"] as const;

export type InvoiceSortDirection = (typeof invoiceSortDirections)[number];

export const invoiceViewModes = ["table", "chart"] as const;

export type InvoiceViewMode = (typeof invoiceViewModes)[number];

export type InvoiceTrendSeriesItem = {
  /** Synthetic CSS-safe series key (`t0`, `t1`, …) — transtypes are free text. */
  key: string;
  /** The raw `transtype` value (or "Unknown" for null). */
  label: string;
};

export type InvoiceTrendPoint = {
  /** UTC day of the header `documentdate`, YYYY-MM-DD. */
  day: string;
  /** Summed line `totalamount` per series key; absent types are 0. */
  values: Record<string, number>;
};

/**
 * Per-day line totals per transaction type across ALL invoices matching the
 * filters (not just one page). Series are ordered by total absolute volume,
 * largest first, so color assignment is stable and meaningful.
 */
export type InvoiceTrend = {
  series: InvoiceTrendSeriesItem[];
  points: InvoiceTrendPoint[];
};

const invoiceDateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
});

const invoiceDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

const invoiceAmountFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "EUR",
});

export function formatInvoiceDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : invoiceDateFormatter.format(parsed);
}

export function formatInvoiceDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : invoiceDateTimeFormatter.format(parsed);
}

export function formatInvoiceAmount(value: number | null): string {
  return value === null ? "—" : invoiceAmountFormatter.format(value);
}
