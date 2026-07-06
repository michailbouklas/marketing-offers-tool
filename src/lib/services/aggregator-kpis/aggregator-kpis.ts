/**
 * Browser-safe types and constants for the `/aggregator-kpis` section.
 * Server-only Prisma queries against the merchant-scrapes database live in the
 * sibling `*.server.ts` modules.
 *
 * All timestamps are explicit UTC ISO strings (e.g. "2026-01-01T00:00:00Z")
 * produced server-side — parse with `new Date(value)`.
 */

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

/** Aggregator platforms, matching the merchant-scrapes `Aggregator` enum. */
export const aggregators = ["FOODY", "WOLT"] as const;

export type AggregatorValue = (typeof aggregators)[number];

export const kpiSortDirections = ["asc", "desc"] as const;

export type KpiSortDirection = (typeof kpiSortDirections)[number];

/** Sortable columns on the reviews table. */
export const reviewSortFields = ["reviewed_at", "rating"] as const;

export type ReviewSortField = (typeof reviewSortFields)[number];

/** A store the KPI filters can scope to. */
export type StoreRef = {
  id: number;
  name: string | null;
  aggregator: AggregatorValue;
};

/** Filters shared by every KPI view, parsed from URL search params. */
export type KpiFilters = {
  aggregator: AggregatorValue | null;
  storeId: number | null;
  /** UTC day, "YYYY-MM-DD"; inclusive lower bound. */
  from: string | null;
  /** UTC day, "YYYY-MM-DD"; inclusive upper bound. */
  to: string | null;
};

export type TimeseriesPoint = {
  /** UTC day, "YYYY-MM-DD". */
  day: string;
  value: number;
};

/** Fields shared by every latest-per-store KPI row. */
type StoreKpiBase = {
  storeId: number;
  storeName: string | null;
  aggregator: AggregatorValue;
  /** When the latest snapshot with this KPI was captured. */
  scrapedAt: string | null;
};

export type ClosureRow = StoreKpiBase & {
  offlineOpenHoursPct: number | null;
  unreachableSeconds: number | null;
};

export type RejectionRow = StoreKpiBase & {
  cancellationsPct: number | null;
  lostSales: number | null;
  reasonUnknownCount: number | null;
};

export type PunctualityRow = StoreKpiBase & {
  avoidableWaitOrdersPct: number | null;
  avgAvoidableWaitSeconds: number | null;
  deliveredOrders: number | null;
  totalOrders: number | null;
};

export type RatingRow = StoreKpiBase & {
  storeRating: number | null;
  totalReviews: number | null;
};

export type StarBucket = {
  stars: number;
  count: number;
};

export type ReviewRow = {
  id: number;
  storeId: number;
  storeName: string | null;
  aggregator: AggregatorValue;
  rating: number;
  comment: string;
  reviewedAt: string | null;
};

// --- Per-KPI view payloads ---

export type ClosuresView = {
  rows: ClosureRow[];
  trend: TimeseriesPoint[];
};

export type RejectionsView = {
  rows: RejectionRow[];
  trend: TimeseriesPoint[];
};

export type PunctualityView = {
  rows: PunctualityRow[];
  trend: TimeseriesPoint[];
};

export type RatingsView = {
  rows: RatingRow[];
  trend: TimeseriesPoint[];
  distribution: StarBucket[];
};

// --- Dashboard ---

export type KpiDashboardStats = {
  storeCount: number;
  foodyCount: number;
  woltCount: number;
  totalReviews: number;
  /** Averages across the latest snapshot per store; null when no data. */
  avgStoreRating: number | null;
  avgOfflineOpenHoursPct: number | null;
  avgCancellationsPct: number | null;
  avgAvoidableWaitOrdersPct: number | null;
};

// --- Sub-route metadata for the landing cards ---

export type KpiSubRouteKey =
  | "closures"
  | "order-rejections"
  | "punctuality"
  | "ratings"
  | "reviews";

export type KpiSubRoute = {
  key: KpiSubRouteKey;
  label: string;
  href: string;
  eyebrow: string;
  description: string;
};

export const kpiSubRoutes: KpiSubRoute[] = [
  {
    key: "closures",
    label: "Closures",
    href: "/aggregator-kpis/closures",
    eyebrow: "Availability",
    description:
      "How often stores go offline during their advertised open hours, and total unreachable time.",
  },
  {
    key: "order-rejections",
    label: "Order Rejections",
    href: "/aggregator-kpis/order-rejections",
    eyebrow: "Fulfilment",
    description:
      "Cancellation rates, lost sales, and orders rejected for unknown reasons.",
  },
  {
    key: "punctuality",
    label: "Punctuality",
    href: "/aggregator-kpis/punctuality",
    eyebrow: "Timeliness",
    description:
      "Share of orders with avoidable waiting time and the average avoidable wait.",
  },
  {
    key: "ratings",
    label: "Ratings",
    href: "/aggregator-kpis/ratings",
    eyebrow: "Reputation",
    description:
      "Store ratings, review counts, and how they distribute across star buckets.",
  },
  {
    key: "reviews",
    label: "Reviews",
    href: "/aggregator-kpis/reviews",
    eyebrow: "Voice of customer",
    description:
      "Individual customer reviews scraped from each aggregator, filterable by store and rating.",
  },
];

// --- Shared aggregate + formatting helpers (browser-safe) ---

/** Average of the present (non-null, numeric) values; null when there are none. */
export function averageValues(
  values: (number | null | undefined)[],
): number | null {
  const present = values.filter(
    (value): value is number =>
      value !== null && value !== undefined && !Number.isNaN(value),
  );

  if (present.length === 0) {
    return null;
  }

  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

/** Sum of the present (non-null, numeric) values; null when there are none. */
export function sumValues(
  values: (number | null | undefined)[],
): number | null {
  const present = values.filter(
    (value): value is number =>
      value !== null && value !== undefined && !Number.isNaN(value),
  );

  if (present.length === 0) {
    return null;
  }

  return present.reduce((sum, value) => sum + value, 0);
}

/** Human label for an aggregator value, e.g. "Foody". */
export function aggregatorLabel(value: AggregatorValue): string {
  switch (value) {
    case "FOODY":
      return "Foody";
    case "WOLT":
      return "Wolt";
    default:
      return value;
  }
}

/** A percentage with one decimal, e.g. "12.5%"; "—" when missing. */
export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return `${value.toFixed(1)}%`;
}

/** A rating with one decimal, e.g. "4.3"; "—" when missing. */
export function formatRating(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return value.toFixed(1);
}

const numberFormatter = new Intl.NumberFormat();

/** Locale integer/number formatting; "—" when missing. */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return numberFormatter.format(value);
}

/** Seconds rendered as a compact duration, e.g. "1h 5m" or "45s"; "—" when missing. */
export function formatDuration(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  const total = Math.round(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

/** Money-ish value with a leading € and thousands separators; "—" when missing. */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return `€${numberFormatter.format(Math.round(value))}`;
}

/** Formats a UTC ISO timestamp in the viewer's locale; "—" when missing. */
export function formatKpiDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
