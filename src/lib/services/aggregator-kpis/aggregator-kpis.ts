/**
 * Browser-safe types and constants for the `/aggregator-kpis` section.
 * Server-only Prisma queries against the merchant-scrapes database live in the
 * sibling `*.server.ts` modules.
 *
 * All timestamps are explicit UTC ISO strings (e.g. "2026-01-01T00:00:00Z")
 * produced server-side — parse with `new Date(value)`.
 */
import { z } from "zod";

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

/**
 * A Wolt-only portal delta: the aggregator's own signed % change plus the
 * free-text comparison window it was measured against ("6 days"). Captured
 * verbatim from the page. Display-only — NEVER sum/average these, derive numbers
 * from them, or mix them with your own period-over-period math (handoff §3).
 * Absent (undefined) for Foody rows; `pct` can be null while a value is present.
 */
export type PortalDelta = {
  /** Signed percent change as shown by the portal; null when the portal omits it. */
  pct: number | null;
  /** Portal's comparison-window text, e.g. "6 days" — display verbatim, don't parse. */
  window: string | null;
};

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

// --- Period model (Foody `foody_*_by_period` views) ---
//
// Foody KPI snapshots are labeled with the closed reporting period they cover.
// `period_days` discriminates the period kind: 7 = week, >= 28 = month. Week and
// month rows overlap, so a query must always pick one lane (never mix them).

/** Period kind selector for the Foody period views. */
export const periodKinds = ["week", "month"] as const;

export type PeriodKind = (typeof periodKinds)[number];

/** Filters for the Foody period views, parsed from URL search params. */
export type PeriodFilters = {
  /** Single store to scope to; null = all Foody stores. */
  storeId: number | null;
  /** Week or month lane; defaults to "week". */
  period: PeriodKind;
};

/** One point in a per-period trend: a closed period and one aggregated value. */
export type PeriodPoint = {
  /** Period start (inclusive), "YYYY-MM-DD". */
  periodStart: string;
  /** Period end (inclusive), "YYYY-MM-DD". */
  periodEnd: string;
  /** 7 = week, 28..31 = month. */
  periodDays: number;
  value: number;
};

/** Human label for a period kind, e.g. "Weekly". */
export function periodKindLabel(period: PeriodKind): string {
  return period === "month" ? "Monthly" : "Weekly";
}

/**
 * Labels a period for an axis tick, e.g. week → "Jun 1", month → "Jun 2026".
 * `periodStart` is a "YYYY-MM-DD" day string parsed as UTC.
 */
export function formatPeriodShort(
  periodStart: string,
  period: PeriodKind,
): string {
  const date = new Date(`${periodStart}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return periodStart;
  }

  if (period === "month") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Labels a full period for a tooltip, e.g. week → "Week of Jun 1 – Jun 7, 2026",
 * month → "June 2026". Both bounds are inclusive "YYYY-MM-DD" day strings.
 */
export function formatPeriodLong(
  periodStart: string,
  periodEnd: string,
  period: PeriodKind,
): string {
  const start = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(`${periodEnd}T00:00:00Z`);

  if (Number.isNaN(start.getTime())) {
    return periodStart;
  }

  if (period === "month") {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(start);
  }

  const startLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(start);
  const endLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(Number.isNaN(end.getTime()) ? start : end);

  return `Week of ${startLabel} – ${endLabel}`;
}

/** Fields shared by every latest-per-store KPI row. */
type StoreKpiBase = {
  storeId: number;
  storeName: string | null;
  aggregator: AggregatorValue;
  /** When the latest snapshot with this KPI was captured. */
  scrapedAt: string | null;
  /**
   * Reporting period the row covers, present only on rows sourced from the
   * Foody `foody_*_by_period` views. Absent on legacy latest-by-scrapedAt rows.
   */
  periodStart?: string | null;
  periodEnd?: string | null;
  periodDays?: number | null;
};

export type ClosureRow = StoreKpiBase & {
  offlineOpenHoursPct: number | null;
  unreachableSeconds: number | null;
  /** Total offline seconds; only captured from 2026-07-09 onward. */
  offlineDurationSeconds: number | null;
  /** Portal's own offline display string (e.g. "2d 6h"); null when absent. */
  offlineDurationRaw: string | null;
  /**
   * Wolt only (`loss_amount`): € lost to unavailability this period. No Foody
   * equivalent — undefined/null for Foody rows.
   */
  lossAmount?: number | null;
  /** Wolt-only portal deltas (display-only); absent for Foody. */
  deltas?: {
    offlineDuration: PortalDelta | null;
    offlineOpenHoursPct: PortalDelta | null;
    loss: PortalDelta | null;
  } | null;
};

/** One historical closures snapshot for a single store. */
export type ClosureHistoryPoint = {
  /** When the snapshot was captured (UTC ISO). */
  scrapedAt: string;
  offlineOpenHoursPct: number | null;
  unreachableSeconds: number | null;
  /** Total offline seconds; only captured from 2026-07-09 onward. */
  offlineDurationSeconds: number | null;
  /** Portal's own offline display string (e.g. "2d 6h"); null when absent. */
  offlineDurationRaw: string | null;
  /** Scraper run id; null for legacy pre-2026-07-06 rows. */
  runId: string | null;
};

/** Full store-detail record, shared across per-store KPI detail pages. */
export type KpiStoreDetail = {
  id: number;
  name: string | null;
  aggregator: AggregatorValue;
  externalId: string;
  slug: string | null;
  url: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RejectionRow = StoreKpiBase & {
  cancellationsPct: number | null;
  /** Headline cancellation count; only captured from 2026-07-09 onward. */
  cancellationsCount: number | null;
  lostSales: number | null;
  reasonUnknownCount: number | null;
  /**
   * Wolt-only extras from `wolt_rejections_by_period`; undefined for Foody.
   * `lateOrdersPct` = share of late orders; `prepTimeSeconds`/`prepTimeRaw` =
   * average preparation time; `preparedLaterCount` = orders prepared late.
   */
  lateOrdersPct?: number | null;
  prepTimeSeconds?: number | null;
  prepTimeRaw?: string | null;
  preparedLaterCount?: number | null;
  /**
   * Wolt-only portal deltas (display-only); absent for Foody. The Wolt rejections
   * view only exposes deltas for late-orders, prep-time and prepared-later — the
   * avoidable-rejections count and loss cells have no delta column.
   */
  deltas?: {
    lateOrdersPct: PortalDelta | null;
    prepTime: PortalDelta | null;
    preparedLater: PortalDelta | null;
  } | null;
};

/** One historical order-rejections snapshot for a single store. */
export type RejectionHistoryPoint = {
  /** When the snapshot was captured (UTC ISO). */
  scrapedAt: string;
  cancellationsPct: number | null;
  /** Headline cancellation count; only captured from 2026-07-09 onward. */
  cancellationsCount: number | null;
  lostSales: number | null;
  reasonUnknownCount: number | null;
  /** Scraper run id; null for legacy pre-2026-07-06 rows. */
  runId: string | null;
};

export type PunctualityRow = StoreKpiBase & {
  avoidableWaitOrdersPct: number | null;
  avgAvoidableWaitSeconds: number | null;
  deliveredOrders: number | null;
  totalOrders: number | null;
};

/** One historical punctuality snapshot for a single store. */
export type PunctualityHistoryPoint = {
  /** When the snapshot was captured (UTC ISO). */
  scrapedAt: string;
  avoidableWaitOrdersPct: number | null;
  avgAvoidableWaitSeconds: number | null;
  deliveredOrders: number | null;
  totalOrders: number | null;
  /** Scraper run id; null for legacy pre-2026-07-06 rows. */
  runId: string | null;
};

export type RatingRow = StoreKpiBase & {
  storeRating: number | null;
  totalReviews: number | null;
};

/** One historical rating snapshot for a single store. */
export type RatingHistoryPoint = {
  /** When the snapshot was captured (UTC ISO). */
  scrapedAt: string;
  storeRating: number | null;
  totalReviews: number | null;
  /** Scraper run id; null for legacy pre-2026-07-06 rows. */
  runId: string | null;
};

export type StarBucket = {
  stars: number;
  count: number;
};

/**
 * The order behind a review, as captured from the aggregator portal's own order
 * drawer. Canonical shape: `OrderDetails` in the scraper's `src/foody/types.ts`.
 * Every field except `orderId`, `timeline`, `products`, `scrapedAt` can be null;
 * the two arrays can be empty. Money fields are raw display strings that already
 * include `€` and sign (e.g. `"€13.80"`, `"-€1.79"`) — display verbatim, never
 * treat null as €0.
 */
export type OrderTimelineStep = {
  /** Stable machine key from the portal (open set); use for icons/ordering. */
  key: string;
  /** Display label, e.g. "Order delivered". */
  label: string;
  /** Wall-clock "HH:MM" string (can cross midnight) — NOT a timestamp. */
  time: string | null;
  /** Extra display lines, e.g. "7 min. late", "Accepted in 1 sec". */
  notes: string[];
};

export type OrderProductOption = {
  quantity: number | null;
  name: string;
  /** Raw display string, often "€0.00" for bundled options. */
  price: string | null;
};

export type OrderProduct = {
  quantity: number | null;
  name: string;
  /** Raw display string — the portal's own line total. */
  price: string | null;
  options: OrderProductOption[];
};

export type OrderDetails = {
  orderId: number;
  /** The drawer's status chip, e.g. "Completed"; free text, do not enum-gate. */
  status: string | null;
  /** Ordered milestones; may be empty. */
  timeline: OrderTimelineStep[];
  /** Line items; may be empty. */
  products: OrderProduct[];
  subtotal: string | null;
  /** Negative = deducted from the merchant. */
  commission: string | null;
  /** Percent — the one parsed numeric money field. */
  commissionRate: number | null;
  taxCharge: string | null;
  estimatedEarnings: string | null;
  paymentMethod: string | null;
  deliveryType: string | null;
  /** ISO — same value as the `orderScrapedAt` column. */
  scrapedAt: string;
};

export type ReviewRow = {
  id: number;
  storeId: number;
  storeName: string | null;
  aggregator: AggregatorValue;
  externalOrderId: string | null;
  dedupeKey: string;
  rating: number;
  comment: string;
  reviewedAt: string | null;
  reviewedAtRaw: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Full order behind the review; null = not enriched yet, NOT "no order". */
  orderDetails: OrderDetails | null;
  /** When `orderDetails` was last fetched (ISO); null when not enriched. */
  orderScrapedAt: string | null;
};

/** Matches a portal lateness note like "7 min. late" / "12 min late". */
const LATE_NOTE_RE = /(\d+)\s*min\.?\s*late/i;

/**
 * First lateness figure (in minutes) found across all timeline notes of an
 * order, or null when the order is missing or shows no lateness note.
 */
export function orderLateMinutes(order: OrderDetails | null): number | null {
  if (!order) return null;

  for (const step of order.timeline) {
    for (const note of step.notes) {
      const match = LATE_NOTE_RE.exec(note);
      if (match) return Number.parseInt(match[1], 10);
    }
  }

  return null;
}

// --- Per-KPI view payloads ---

export type ClosuresView = {
  rows: ClosureRow[];
  trend: TimeseriesPoint[];
};

/** Per-store closures detail payload: full history + trend derived from it. */
export type ClosuresStoreView = {
  points: ClosureHistoryPoint[];
  trend: TimeseriesPoint[];
  /** Latest-snapshot offline reason breakdown; null when no reason data. */
  reasonBreakdown: ClosureReasonBreakdown | null;
};

export type RejectionsView = {
  rows: RejectionRow[];
  trend: TimeseriesPoint[];
  /** Cross-store lost sales grouped by reason (latest snapshot per store). */
  lostSalesByReason: LostSalesByReasonRow[];
};

/** Per-store order-rejections detail payload: full history + trend from it. */
export type RejectionsStoreView = {
  points: RejectionHistoryPoint[];
  trend: TimeseriesPoint[];
  /** Latest-snapshot reason breakdown; null when no reason data was captured. */
  reasonBreakdown: CancellationReasonBreakdown | null;
  /** Reason totals over time; empty until the 2026-07-09 cutover. */
  reasonTrend: ReasonTrend;
};

// --- Operations reason breakdowns (from 2026-07-09) ---

/**
 * One slice of a reason breakdown: a free-text reason and its value (either a
 * cancellation count or a € sales-loss figure, depending on the series).
 */
export type ReasonSlice = {
  reason: string;
  value: number;
};

/**
 * Latest-snapshot cancellation reason breakdown for one store. Totals come from
 * the authoritative headline columns, NOT from summing the reason rows. An empty
 * `byCount`/`bySalesLoss` is a legitimate zero ("no cancellations"), not missing
 * data — callers gate on `scrapedAt` being present to tell the two apart.
 */
export type CancellationReasonBreakdown = {
  /** When the breakdown snapshot was captured (UTC ISO); null when absent. */
  scrapedAt: string | null;
  cancellationsCount: number | null;
  cancellationsPct: number | null;
  lostSales: number | null;
  /** Per-reason cancellation counts, sorted desc. */
  byCount: ReasonSlice[];
  /** Per-reason € sales loss, sorted desc. */
  bySalesLoss: ReasonSlice[];
};

/** Latest-snapshot closure reason breakdown for one store. */
export type ClosureReasonBreakdown = {
  /** When the breakdown snapshot was captured (UTC ISO); null when absent. */
  scrapedAt: string | null;
  offlineDurationSeconds: number | null;
  offlineDurationRaw: string | null;
  /** Per-reason offline durations, sorted by duration desc. */
  reasons: {
    reason: string;
    durationSeconds: number | null;
    durationRaw: string | null;
  }[];
};

/** One point in a reason-over-time trend: a snapshot and per-reason values. */
export type ReasonTrendPoint = {
  /** When the snapshot was captured (UTC ISO). */
  scrapedAt: string;
  /** Reason key -> value at this snapshot (absent reasons omitted = zero). */
  values: Record<string, number>;
};

/** Stacked reason totals over time; one series per reason seen in the window. */
export type ReasonTrend = {
  series: { key: string; label: string }[];
  points: ReasonTrendPoint[];
};

/** Cross-store lost-sales aggregation, grouped by cancellation reason. */
export type LostSalesByReasonRow = {
  reason: string;
  salesLoss: number;
  /** How many stores contributed to this reason's total. */
  storeCount: number;
};

export type PunctualityView = {
  rows: PunctualityRow[];
  trend: TimeseriesPoint[];
};

/** Per-store punctuality detail payload: full history + trend from it. */
export type PunctualityStoreView = {
  points: PunctualityHistoryPoint[];
  trend: TimeseriesPoint[];
};

export type RatingsView = {
  rows: RatingRow[];
  trend: TimeseriesPoint[];
  distribution: StarBucket[];
};

/**
 * Per-store ratings detail payload: full history, a rating trend derived from
 * it, and the star distribution of the store's latest rating snapshot.
 */
export type RatingsStoreView = {
  points: RatingHistoryPoint[];
  trend: TimeseriesPoint[];
  distribution: StarBucket[];
};

// --- Wolt-only per-day drill-downs (decoded from portal charts) ---
//
// Decoded from chart pixel geometry, not portal text (handoff §4.3) — accurate
// but not contractual, so label absolute-value charts "approx.". The headline
// view columns remain authoritative. `date` is a "YYYY-MM-DD" UTC day string.

/**
 * One decoded day of Wolt unavailability, split into "app not live" vs
 * "manually put offline", with the € lost that day. Every day in the period
 * gets a row — a `(0, 0)` row is a real zero-closure day (handoff §4.4).
 */
export type WoltClosureDay = {
  date: string;
  appNotLiveSeconds: number | null;
  manualOfflineSeconds: number | null;
  lossAmount: number | null;
};

/**
 * One decoded day of Wolt order rejections, split into auto- vs actively
 * rejected, with the € lost that day. Only days WITH rejections produce rows —
 * an absent date inside the period is a real zero (fill client-side, §4.4).
 */
export type WoltRejectionDay = {
  date: string;
  autoRejected: number | null;
  activelyRejected: number | null;
  lossAmount: number | null;
};

// --- Foody period views for the operations KPIs (week/month lanes) ---
//
// These reuse the existing *Row shapes (now carrying periodStart/periodEnd),
// but source one exact row per closed period from the foody_*_by_period views
// instead of the latest-by-scrapedAt snapshot. Trends are per-period.

/** Closures for the latest completed period, plus a per-period trend. */
export type ClosuresPeriodView = {
  period: PeriodKind;
  rows: ClosureRow[];
  /** Per-period total offline hours across the scope (a summable flow). */
  trend: PeriodPoint[];
  /**
   * Wolt only: latest period's unavailability per day, summed by date across the
   * scope. Empty for Foody, or when the per-day chart didn't render (§4.4).
   */
  perDay?: WoltClosureDay[];
};

/** Per-store closures period history + a trend derived from it. */
export type ClosuresPeriodStoreView = {
  period: PeriodKind;
  rows: ClosureRow[];
  trend: PeriodPoint[];
  reasonBreakdown: ClosureReasonBreakdown | null;
  /** Wolt only: latest period's per-day unavailability for this store. */
  perDay?: WoltClosureDay[];
};

/** Order rejections for the latest completed period, plus a per-period trend. */
export type RejectionsPeriodView = {
  period: PeriodKind;
  rows: RejectionRow[];
  /** Per-period total lost sales (€) across the scope. */
  trend: PeriodPoint[];
  lostSalesByReason: LostSalesByReasonRow[];
  /**
   * Wolt only: latest period's rejections per day, summed by date across the
   * scope (zero-filled over the period range). Empty for Foody.
   */
  perDay?: WoltRejectionDay[];
};

/** Per-store order-rejections period history + a trend derived from it. */
export type RejectionsPeriodStoreView = {
  period: PeriodKind;
  rows: RejectionRow[];
  trend: PeriodPoint[];
  reasonBreakdown: CancellationReasonBreakdown | null;
  reasonTrend: ReasonTrend;
  /** Wolt only: latest period's per-day rejections for this store. */
  perDay?: WoltRejectionDay[];
};

/** Punctuality for the latest completed period, plus a per-period trend. */
export type PunctualityPeriodView = {
  period: PeriodKind;
  rows: PunctualityRow[];
  /** Per-period order-weighted avoidable-wait order % across the scope. */
  trend: PeriodPoint[];
};

/** Per-store punctuality period history + a trend derived from it. */
export type PunctualityPeriodStoreView = {
  period: PeriodKind;
  rows: PunctualityRow[];
  trend: PeriodPoint[];
};

/**
 * One store's Foody Pro growth for one closed period. Two independent blocks:
 * Pro subscription (`proOrders`/`nonProOrders`) and new-vs-returning
 * (`newCustomerOrders`/`returningCustomerOrders`), each with its own denominator.
 * `proBoxFound = false` (with OK status) means the store is not on Foody Pro —
 * its counts are null and the UI shows "Not on Pro", never 0. Likewise
 * `newVsReturningFound = false` means that block produced no data.
 */
export type ProGrowthRow = StoreKpiBase & {
  proBoxFound: boolean | null;
  proOrders: number | null;
  nonProOrders: number | null;
  newVsReturningFound: boolean | null;
  newCustomerOrders: number | null;
  returningCustomerOrders: number | null;
};

/** Pro growth for the latest completed period, plus per-period share trends. */
export type ProGrowthPeriodView = {
  period: PeriodKind;
  rows: ProGrowthRow[];
  /** Per-period Pro order share (%) across the scope, recomputed from sums. */
  proShareTrend: PeriodPoint[];
  /** Per-period new-customer order share (%) across the scope, from sums. */
  newShareTrend: PeriodPoint[];
};

/** Per-store pro growth period history + share trends derived from it. */
export type ProGrowthPeriodStoreView = {
  period: PeriodKind;
  rows: ProGrowthRow[];
  proShareTrend: PeriodPoint[];
  newShareTrend: PeriodPoint[];
};

/**
 * Order-weighted avoidable-wait order percentage across rows (rule 2): weight
 * each store's percentage by its `totalOrders` rather than a flat average.
 * Returns null when no row carries both a percentage and an order count.
 */
export function weightedAvoidableWaitPct(
  rows: { avoidableWaitOrdersPct: number | null; totalOrders: number | null }[],
): number | null {
  let weightedSum = 0;
  let totalOrders = 0;

  for (const row of rows) {
    if (row.avoidableWaitOrdersPct === null || row.totalOrders === null) {
      continue;
    }
    weightedSum += (row.avoidableWaitOrdersPct / 100) * row.totalOrders;
    totalOrders += row.totalOrders;
  }

  return totalOrders > 0 ? (weightedSum / totalOrders) * 100 : null;
}

/**
 * Company-wide (or scoped) Foody Pro order share (%) recomputed from sums
 * (rule 2): 100 * SUM(proOrders) / SUM(proOrders + nonProOrders). Rows not on
 * Pro carry null counts and drop out naturally. Returns null when the summed
 * denominator is 0 (no store on Pro in scope).
 */
export function proOrderShare(
  rows: { proOrders: number | null; nonProOrders: number | null }[],
): number | null {
  let numerator = 0;
  let denominator = 0;

  for (const row of rows) {
    if (row.proOrders === null || row.nonProOrders === null) {
      continue;
    }
    numerator += row.proOrders;
    denominator += row.proOrders + row.nonProOrders;
  }

  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

/**
 * Company-wide (or scoped) new-customer order share (%) recomputed from sums
 * (rule 2): 100 * SUM(newCustomerOrders) / SUM(new + returning). Its own
 * denominator — never reconcile against the Pro block or metrics orders.
 * Returns null when the summed denominator is 0.
 */
export function newCustomerShare(
  rows: {
    newCustomerOrders: number | null;
    returningCustomerOrders: number | null;
  }[],
): number | null {
  let numerator = 0;
  let denominator = 0;

  for (const row of rows) {
    if (
      row.newCustomerOrders === null ||
      row.returningCustomerOrders === null
    ) {
      continue;
    }
    numerator += row.newCustomerOrders;
    denominator += row.newCustomerOrders + row.returningCustomerOrders;
  }

  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

// --- Metrics (Foody sales / orders / basket, from foody_metrics_by_period) ---

/** One store's metrics for one closed period. */
export type MetricRow = {
  storeId: number;
  storeName: string | null;
  periodStart: string;
  periodEnd: string;
  periodDays: number;
  sales: number | null;
  orders: number | null;
  avgBasketSize: number | null;
  avgBasketItems: number | null;
  /**
   * Foody: completed orders for the period. Wolt: the venue-home "Completed
   * orders" figure, which is **today-scoped at scrape time** — not comparable to
   * the period numbers. Label/hide it for Wolt (handoff §4.2).
   */
  completedOrders: number | null;
  /** Source platform; defaults to Foody when absent (legacy Foody-only rows). */
  aggregator?: AggregatorValue;
  /** Wolt-only portal deltas (display-only); absent for Foody. */
  deltas?: {
    sales: PortalDelta | null;
    orders: PortalDelta | null;
    avgBasketSize: PortalDelta | null;
    avgBasketItems: PortalDelta | null;
  } | null;
};

/**
 * Company-wide (or single-store) totals for one closed period. `avgBasketSize`
 * is recomputed as SUM(sales)/SUM(orders) — never the mean of per-store ratios.
 */
export type MetricsTotals = {
  periodStart: string | null;
  periodEnd: string | null;
  periodDays: number | null;
  sales: number | null;
  orders: number | null;
  completedOrders: number | null;
  avgBasketSize: number | null;
  /** Stores that contributed a row to this period. */
  storeCount: number;
};

/** Metrics view payload: latest-period totals, per-period trends, store rows. */
export type MetricsView = {
  period: PeriodKind;
  /** Latest closed period, aggregated across the store scope. */
  totals: MetricsTotals;
  /** Per-period SUM(sales) across the scope, ascending. */
  salesTrend: PeriodPoint[];
  /** Per-period SUM(orders) across the scope, ascending. */
  ordersTrend: PeriodPoint[];
  /** Per-store rows for the latest closed period. */
  rows: MetricRow[];
};

/** Per-store metrics detail payload: full period history + derived trends. */
export type MetricsStoreView = {
  period: PeriodKind;
  latest: MetricRow | null;
  salesTrend: PeriodPoint[];
  ordersTrend: PeriodPoint[];
  basketTrend: PeriodPoint[];
  /** Full period history (newest first) for the table. */
  points: MetricRow[];
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
  /** Total Foody sales for the latest completed week; null when none yet. */
  latestFoodyWeeklySales: number | null;
  /** Company-wide Foody Pro order share (%) for the latest completed week. */
  proOrderSharePct: number | null;
};

// --- Sub-route metadata for the landing cards ---

export type KpiSubRouteKey =
  | "metrics"
  | "closures"
  | "order-rejections"
  | "punctuality"
  | "pro-growth"
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
    key: "metrics",
    label: "Metrics",
    href: "/aggregator-kpis/metrics",
    eyebrow: "Performance",
    description:
      "Sales, orders, and average basket per closed week or month — Foody only.",
  },
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
    key: "pro-growth",
    label: "Pro Growth",
    href: "/aggregator-kpis/pro-growth",
    eyebrow: "Growth",
    description:
      "Foody Pro subscription adoption and the new vs. returning customer mix.",
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

/**
 * Renders a Wolt portal delta as a badge string, e.g. "−7% vs 6 days" (sign
 * kept, minus rendered as a true minus glyph). Returns null when there is no
 * numeric delta to show. The comparison window is displayed verbatim — never
 * parsed or aggregated (handoff §3).
 */
export function formatPortalDelta(
  delta: PortalDelta | null | undefined,
): string | null {
  if (!delta || delta.pct === null || Number.isNaN(delta.pct)) {
    return null;
  }

  const sign = delta.pct > 0 ? "+" : delta.pct < 0 ? "−" : "";
  const pct = `${sign}${Math.abs(delta.pct).toFixed(1)}%`;

  return delta.window ? `${pct} vs ${delta.window}` : pct;
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

const salesLossFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "EUR",
});

/**
 * Euro amount with cents, e.g. "€343.20"; "—" when missing. Unlike `formatMoney`
 * this keeps cents — used for per-reason sales-loss figures where precision matters.
 */
export function formatSalesLoss(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return salesLossFormatter.format(value);
}

/**
 * Seconds rendered with day granularity, e.g. "2d 6h", "6h 30m", "45m"; "—" when
 * missing. Prefer `raw` (the portal's own display string) when present, since the
 * scraper already formatted it the way the portal shows it.
 */
export function formatDurationDHM(
  seconds: number | null | undefined,
  raw?: string | null,
): string {
  if (raw) {
    return raw;
  }

  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return "—";
  }

  const total = Math.round(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${minutes}m`;
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

// --- Scrape sessions (ScrapeRun) ---

/**
 * Scrape-run statuses, matching the merchant-scrapes `ScrapeRunStatus` enum.
 * `RUNNING` is the in-flight state; the rest are terminal outcomes.
 */
export const scrapeRunStatuses = [
  "RUNNING",
  "COMPLETED",
  "INTERRUPTED",
  "SYSTEMIC_BREAKAGE",
  "CRASHED",
] as const;

export type ScrapeRunStatus = (typeof scrapeRunStatuses)[number];

/** One scrape *session* (= one supervisor invocation) row. */
export type ScrapeSessionRow = {
  id: number;
  /** Supervisor-minted session id, stable across restarts. */
  sessionId: string;
  aggregator: AggregatorValue;
  status: ScrapeRunStatus;
  /** Shard label, e.g. "2/3"; null for unsharded runs. */
  shard: string | null;
  /** Whether `--fresh` was passed (full re-scrape) vs a resume. */
  fresh: boolean;
  /** Child batch run id; null until a child has scraped something. */
  runId: string | null;
  /** UTC ISO timestamp the session started. */
  startedAt: string;
  /** UTC ISO timestamp the session ended; null while still running. */
  endedAt: string | null;
  /** Wall-clock duration in seconds; null while the session is running. */
  durationSeconds: number | null;
  /** Supervisor child restarts. */
  restarts: number;
  totalStores: number | null;
  okStores: number;
  partialStores: number;
  failedStores: number;
  skippedStores: number;
  /**
   * End-of-session per-section diagnosis parsed from `ScrapeRun.sectionDiagnostics`.
   * `null` for sessions finalized before diagnostics shipped (or that scraped
   * nothing) — render as "not captured", never as empty charts or zeros.
   */
  diagnostics: ManifestDiagnostics | null;
};

/** Summary totals across the filtered sessions. */
export type ScrapeSessionsTotals = {
  /** Number of sessions matched. */
  sessions: number;
  /** Sessions with a COMPLETED terminal status. */
  completed: number;
  /** Sessions that ended in CRASHED or SYSTEMIC_BREAKAGE. */
  failed: number;
  /** Sessions still in the RUNNING state. */
  running: number;
  /** Total OK stores rolled up across the matched sessions. */
  storesScraped: number;
  /**
   * Stores whose store switch failed (nothing scraped), summed across runs that
   * captured diagnostics. Surfaced separately from extraction problems.
   */
  switchFailedStores: number;
  /** Stores extracted more than once (retried), summed across diagnostics runs. */
  retriedStores: number;
};

/** Sessions view payload: table rows, a stores-scraped-per-day trend, totals. */
export type ScrapeSessionsView = {
  rows: ScrapeSessionRow[];
  trend: TimeseriesPoint[];
  /** Per-section extraction-problem-rate trend across the matched runs. */
  sectionHealthTrend: SectionHealthTrend;
  totals: ScrapeSessionsTotals;
};

/** Filters for the sessions view, parsed from URL search params. */
export type SessionFilters = {
  aggregator: AggregatorValue | null;
  status: ScrapeRunStatus | null;
  /** UTC day, "YYYY-MM-DD"; inclusive lower bound. */
  from: string | null;
  /** UTC day, "YYYY-MM-DD"; inclusive upper bound. */
  to: string | null;
};

/** Human label for a scrape-run status, e.g. "Systemic breakage". */
export function scrapeRunStatusLabel(status: ScrapeRunStatus): string {
  switch (status) {
    case "RUNNING":
      return "Running";
    case "COMPLETED":
      return "Completed";
    case "INTERRUPTED":
      return "Interrupted";
    case "SYSTEMIC_BREAKAGE":
      return "Systemic breakage";
    case "CRASHED":
      return "Crashed";
    default:
      return status;
  }
}

/**
 * Tailwind class string that colours a status Badge. The Badge component has no
 * semantic success/warning/info variants, so status colours are applied via the
 * Badge `class` prop (pair with `variant="outline"`): COMPLETED → green,
 * RUNNING → blue, INTERRUPTED → amber, CRASHED / SYSTEMIC_BREAKAGE → red.
 */
export function scrapeRunStatusVariant(status: ScrapeRunStatus): string {
  switch (status) {
    case "COMPLETED":
      return "border-transparent bg-green-500/10 text-green-600 dark:text-green-400";
    case "RUNNING":
      return "border-transparent bg-blue-500/10 text-blue-600 dark:text-blue-400";
    case "INTERRUPTED":
      return "border-transparent bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "SYSTEMIC_BREAKAGE":
    case "CRASHED":
      return "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20";
    default:
      return "border-transparent bg-muted text-muted-foreground";
  }
}

/**
 * Per-section scrape statuses, mirroring the merchant-scrapes `SectionStatus`
 * enum (and `SectionStatus` in the scraper's `src/foody/types.ts`).
 */
export const sectionStatuses = ["OK", "PARTIAL", "FAILED", "SKIPPED"] as const;

export type SectionStatusValue = (typeof sectionStatuses)[number];

/**
 * Derived per-store outcome for one scrape session. There is no per-store
 * status column in the DB — a store's verdict is rolled up from its snapshot's
 * section statuses via {@link deriveStoreOutcome}. The lowercase spelling
 * matches the `okStores`/`partialStores`/… rollup counts on `ScrapeRun`.
 */
export const storeOutcomes = ["ok", "partial", "failed", "skipped"] as const;

export type StoreOutcome = (typeof storeOutcomes)[number];

/** One section's outcome within a single store snapshot. */
export type SectionOutcome = {
  /** Free-form section key ("metrics", "rating", "reviews", "operations", …). */
  key: string;
  status: SectionStatusValue;
  /** Error text captured when the section failed; null otherwise. */
  error: string | null;
  /** Field names the section expected but did not find. */
  missingFields: string[];
  /** Section scrape duration in milliseconds; null when not recorded. */
  durationMs: number | null;
  /**
   * Times this section was extracted. `1` = extracted once (normal path, and
   * the default for historic rows — "not retried"). `>1` = an end-of-session
   * retry pass re-ran the section.
   */
  attempts: number;
};

/** One store's scrape outcome within a session, with its section breakdown. */
export type StoreScrapeOutcome = {
  snapshotId: number;
  storeId: number;
  storeName: string | null;
  externalId: string;
  slug: string | null;
  aggregator: AggregatorValue;
  /** When this store's snapshot was captured (UTC ISO). */
  scrapedAt: string;
  /** Rollup verdict derived from {@link sections}. */
  outcome: StoreOutcome;
  sections: SectionOutcome[];
};

/** Sessions detail payload: the session row plus its per-store outcomes. */
export type SessionDetailView = {
  session: ScrapeSessionRow;
  stores: StoreScrapeOutcome[];
  /** Tally of stores by derived outcome, for the header summary. */
  outcomeCounts: Record<StoreOutcome, number>;
  /**
   * End-of-session per-section diagnosis parsed from `ScrapeRun.sectionDiagnostics`.
   * `null` for sessions finalized before diagnostics shipped (or that scraped
   * nothing) — render as "not captured", never as empty charts or zeros.
   */
  diagnostics: ManifestDiagnostics | null;
};

// --- Section diagnostics (ScrapeRun.sectionDiagnostics Json?) ---
//
// Prisma types `sectionDiagnostics` only as `Json`, so its interior is defined
// and validated here. All label strings (`missingFields[].label`,
// `errors[].label`) are FREE TEXT — new labels can appear any run and some are
// long dotted paths or portal error strings. Derive legends from the data and
// truncate with tooltips; never treat labels as a closed enum.

/** A free-text label with an occurrence count (already ranked desc upstream). */
export type LabeledCount = {
  label: string;
  count: number;
};

/** Per-status store counts for one section; sums to the section's `total`. */
export type SectionStatusTally = {
  ok: number;
  partial: number;
  failed: number;
  skipped: number;
};

/** One section's end-of-session rollup across all stores in a run. */
export type SectionDiagnostic = {
  /** Free-form section key ("metrics" | "rating" | "reviews" | "operations" | future). */
  key: string;
  /** Stores that recorded this section. */
  total: number;
  /** Per-status store counts (sums to `total`). */
  status: SectionStatusTally;
  /** Dominant missing fields, count desc (free-text labels). */
  missingFields: LabeledCount[];
  /** Distinct error messages, count desc (free text). */
  errors: LabeledCount[];
};

/**
 * End-of-session per-section diagnosis (mirrors `ManifestDiagnostics` from the
 * scraper's `src/foody/diagnostics.ts`). Written at session finalize and
 * refreshed by the standalone retry command.
 */
export type ManifestDiagnostics = {
  runId: string;
  /** Shard label, e.g. "2/3"; null for unsharded runs. */
  shard: string | null;
  /** ISO timestamp of the diagnosis. */
  generatedAt: string;
  /** The run's declared store count. */
  totalStores: number;
  /** Stores attempted at least once. */
  recordedStores: number;
  /** Stores whose portal switch succeeded. */
  switchedStores: number;
  /** Stores whose portal switch failed → nothing scraped. */
  switchFailedStores: number;
  /** Stores with >=1 failed/partial section. */
  retryCandidates: number;
  /** Stores extracted more than once. */
  retriedStores: number;
  /** Ordered section rollups (metrics, rating, reviews, operations, …). */
  sections: SectionDiagnostic[];
};

const labeledCountSchema = z.object({
  label: z.string(),
  count: z.number(),
});

const sectionStatusTallySchema = z.object({
  ok: z.number(),
  partial: z.number(),
  failed: z.number(),
  skipped: z.number(),
});

const sectionDiagnosticSchema = z.object({
  key: z.string(),
  total: z.number(),
  status: sectionStatusTallySchema,
  missingFields: z.array(labeledCountSchema),
  errors: z.array(labeledCountSchema),
});

const manifestDiagnosticsSchema = z.object({
  runId: z.string(),
  shard: z.string().nullable(),
  generatedAt: z.string(),
  totalStores: z.number(),
  recordedStores: z.number(),
  switchedStores: z.number(),
  switchFailedStores: z.number(),
  retryCandidates: z.number(),
  retriedStores: z.number(),
  sections: z.array(sectionDiagnosticSchema),
});

/**
 * Parses the untyped `ScrapeRun.sectionDiagnostics` JSON blob into a typed
 * {@link ManifestDiagnostics}. Returns `null` for a null/absent blob AND for a
 * malformed one — both render downstream as "not captured", never as an empty
 * chart. Unknown keys are ignored so additive scraper-side changes don't break
 * reads. Free-text label strings pass through untouched.
 */
export function parseSectionDiagnostics(
  value: unknown,
): ManifestDiagnostics | null {
  if (value === null || value === undefined) {
    return null;
  }

  const result = manifestDiagnosticsSchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * Human label for a free-text section key, e.g. "operations" → "Operations".
 * Keys are not an enum, so this just title-cases the raw key without inventing
 * a mapping — unknown/future keys render as-is with a leading capital.
 */
export function sectionKeyLabel(key: string): string {
  if (key.length === 0) {
    return key;
  }
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Retry verdict for one store, derived from its sections' `attempts` + status:
 *   - "none"            → no section was retried (all `attempts <= 1`).
 *   - "recovered"       → every retried section ended OK (transient miss fixed).
 *   - "needs-attention" → a retried section (`attempts >= 2`) is still
 *                         PARTIAL/FAILED (a stubborn case worth a scraper fix).
 * Sections that were never retried do not, on their own, mark a store as
 * needing attention here — this axis is specifically about retry effectiveness.
 */
export type RetryClassification = "none" | "recovered" | "needs-attention";

export function classifyRetry(
  sections: { status: SectionStatusValue; attempts: number }[],
): RetryClassification {
  const retried = sections.filter((section) => section.attempts > 1);

  if (retried.length === 0) {
    return "none";
  }

  const stillFailing = retried.some(
    (section) => section.status === "PARTIAL" || section.status === "FAILED",
  );

  return stillFailing ? "needs-attention" : "recovered";
}

/** Human label for a retry classification; null for "none" (render nothing). */
export function retryClassificationLabel(
  classification: RetryClassification,
): string | null {
  switch (classification) {
    case "recovered":
      return "Recovered";
    case "needs-attention":
      return "Needs attention";
    default:
      return null;
  }
}

/**
 * Tailwind class string that colours a retry-classification Badge (pair with
 * `variant="outline"`): recovered → green, needs-attention → red.
 */
export function retryClassificationVariant(
  classification: RetryClassification,
): string {
  switch (classification) {
    case "recovered":
      return "border-transparent bg-green-500/10 text-green-600 dark:text-green-400";
    case "needs-attention":
      return "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20";
    default:
      return "border-transparent bg-muted text-muted-foreground";
  }
}

// --- Section health trend (across runs) ---

/** One run's per-section extraction-problem rate. `null` = section not present. */
export type SectionHealthTrendPoint = {
  /** The run's start time (UTC ISO); the x value. */
  scrapedAt: string;
  /**
   * Section key → (partial+failed)/total as a percentage, or `null` when the
   * section recorded no stores this run. `skipped` is excluded on purpose: it
   * means the store switch failed, not a section extraction problem.
   */
  values: Record<string, number | null>;
};

/**
 * Multi-series extraction-problem-rate trend across runs. `series` is the set
 * of section keys seen in any diagnostics-bearing run (first-appearance order).
 * Runs whose diagnostics are `null` (legacy) still emit a point with all-null
 * values so the chart breaks the line there instead of interpolating over it.
 */
export type SectionHealthTrend = {
  series: { key: string; label: string }[];
  points: SectionHealthTrendPoint[];
};

/** (partial+failed)/total as a percentage rounded to 1dp; null when total is 0. */
function sectionProblemRate(section: SectionDiagnostic): number | null {
  if (section.total <= 0) {
    return null;
  }
  const problems = section.status.partial + section.status.failed;
  return Math.round((problems / section.total) * 1000) / 10;
}

/**
 * Builds the {@link SectionHealthTrend} from runs (any order). Runs are sorted
 * ascending by `startedAt`. A run with `null` diagnostics contributes a
 * break-point (all series null) so legacy sessions leave a gap rather than a
 * zero or an interpolated line. Series are the union of section keys across all
 * diagnostics-bearing runs, ordered by first appearance.
 */
export function buildSectionHealthTrend(
  runs: { startedAt: string; diagnostics: ManifestDiagnostics | null }[],
): SectionHealthTrend {
  const seriesKeys: string[] = [];
  const seen = new Set<string>();

  for (const run of runs) {
    for (const section of run.diagnostics?.sections ?? []) {
      if (!seen.has(section.key)) {
        seen.add(section.key);
        seriesKeys.push(section.key);
      }
    }
  }

  const ordered = [...runs].sort((a, b) =>
    a.startedAt.localeCompare(b.startedAt),
  );

  const points: SectionHealthTrendPoint[] = ordered.map((run) => {
    const values: Record<string, number | null> = {};

    if (run.diagnostics === null) {
      // Break-point: every series null at this x.
      for (const key of seriesKeys) {
        values[key] = null;
      }
      return { scrapedAt: run.startedAt, values };
    }

    const byKey = new Map(
      run.diagnostics.sections.map((section) => [section.key, section]),
    );

    for (const key of seriesKeys) {
      const section = byKey.get(key);
      values[key] = section ? sectionProblemRate(section) : null;
    }

    return { scrapedAt: run.startedAt, values };
  });

  return {
    series: seriesKeys.map((key) => ({ key, label: sectionKeyLabel(key) })),
    points,
  };
}

/**
 * Worst-status tone for a section's store tally, for a compact single-dot
 * health indicator: any failed → "failed"; else any partial → "partial"; else
 * any ok → "ok"; else "skipped" (all stores skipped / nothing extracted).
 */
export function sectionTallyTone(tally: SectionStatusTally): StoreOutcome {
  if (tally.failed > 0) {
    return "failed";
  }
  if (tally.partial > 0) {
    return "partial";
  }
  if (tally.ok > 0) {
    return "ok";
  }
  return "skipped";
}

/**
 * Rolls a store's section statuses up into a single verdict:
 *   - no non-skipped sections            → "skipped"
 *   - every non-skipped section is OK     → "ok"
 *   - every non-skipped section FAILED    → "failed"
 *   - any other mix (incl. any PARTIAL)   → "partial"
 */
export function deriveStoreOutcome(
  statuses: SectionStatusValue[],
): StoreOutcome {
  const nonSkipped = statuses.filter((status) => status !== "SKIPPED");

  if (nonSkipped.length === 0) {
    return "skipped";
  }

  if (nonSkipped.every((status) => status === "OK")) {
    return "ok";
  }

  if (nonSkipped.every((status) => status === "FAILED")) {
    return "failed";
  }

  return "partial";
}

/** Human label for a derived store outcome, e.g. "Partial". */
export function storeOutcomeLabel(outcome: StoreOutcome): string {
  switch (outcome) {
    case "ok":
      return "OK";
    case "partial":
      return "Partial";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    default:
      return outcome;
  }
}

/**
 * Tailwind class string that colours a store-outcome Badge (pair with
 * `variant="outline"`). Colours mirror the SessionOutcomeBar: ok → green,
 * partial → amber, failed → red, skipped → zinc.
 */
export function storeOutcomeVariant(outcome: StoreOutcome): string {
  switch (outcome) {
    case "ok":
      return "border-transparent bg-green-500/10 text-green-600 dark:text-green-400";
    case "partial":
      return "border-transparent bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "failed":
      return "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20";
    case "skipped":
      return "border-transparent bg-muted text-muted-foreground";
    default:
      return "border-transparent bg-muted text-muted-foreground";
  }
}

/** Human label for a per-section status, e.g. "Partial". */
export function sectionStatusLabel(status: SectionStatusValue): string {
  switch (status) {
    case "OK":
      return "OK";
    case "PARTIAL":
      return "Partial";
    case "FAILED":
      return "Failed";
    case "SKIPPED":
      return "Skipped";
    default:
      return status;
  }
}

/**
 * Tailwind class string that colours a per-section status chip (pair with
 * `variant="outline"`). Same palette as {@link storeOutcomeVariant}.
 */
export function sectionStatusVariant(status: SectionStatusValue): string {
  switch (status) {
    case "OK":
      return "border-transparent bg-green-500/10 text-green-600 dark:text-green-400";
    case "PARTIAL":
      return "border-transparent bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "FAILED":
      return "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20";
    case "SKIPPED":
      return "border-transparent bg-muted text-muted-foreground";
    default:
      return "border-transparent bg-muted text-muted-foreground";
  }
}
