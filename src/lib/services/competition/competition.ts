/**
 * Browser-safe types and constants for the `/competition` section. Server-only
 * ClickHouse / Prisma queries live in the sibling `*.server.ts` modules.
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

/**
 * Aggregator platform (Wolt, Foody, ...) — the `aggregator` table in the
 * replica. Kept named "Processor" internally; `name` is the aggregator's
 * `display_name` (falling back to `name`). `id` maps onto the `processorId`
 * stored in user preferences.
 */
export type Processor = {
  id: number;
  name: string;
};

export const competitionTrackStates = ["tracked", "ignored"] as const;

export type CompetitionTrackStateValue =
  (typeof competitionTrackStates)[number];

// --- Active offers list ---

export const offerSortFields = [
  "name",
  "restaurant_name",
  "processor_name",
  "price",
  "first_seen",
] as const;

export type OfferSortField = (typeof offerSortFields)[number];

export const competitionSortDirections = ["asc", "desc"] as const;

export type CompetitionSortDirection =
  (typeof competitionSortDirections)[number];

export type CompetitionOfferRow = {
  id: number;
  name: string;
  description: string | null;
  /**
   * Latest price of the offer's linked product (from the `product_price`
   * time-series). The schema carries no discount value/type — an offer's
   * presence is the discount signal. `null` when the offer has no linked
   * product or no captured price.
   */
  price: number | null;
  /** Currency for `price`, supplied from env (the schema stores none). */
  currency: string;
  isActive: boolean;
  /** When the scraper first / last saw the offer (UTC ISO). */
  firstSeen: string | null;
  lastSeen: string | null;
  restaurantId: number;
  restaurantName: string | null;
  processorId: number;
  processorName: string | null;
};

// --- Restaurants list ---

export const restaurantSortFields = [
  "name",
  "processor_name",
  "rating",
  "active_offer_count",
] as const;

export type RestaurantSortField = (typeof restaurantSortFields)[number];

export type CompetitionRestaurantRow = {
  id: number;
  externalId: string;
  name: string;
  processorId: number;
  processorName: string | null;
  rating: number | null;
  ratingCount: number | null;
  minimumOrder: number | null;
  deliveryInfo: string | null;
  sourceUrl: string | null;
  activeOfferCount: number;
  trackState: CompetitionTrackStateValue | null;
  isMonitored: boolean;
};

// --- Restaurant detail ---

export type RestaurantInfo = {
  id: number;
  externalId: string;
  name: string;
  slug: string | null;
  pageTitle: string | null;
  processorId: number;
  processorName: string | null;
  rating: number | null;
  ratingCount: number | null;
  ratingScale: number | null;
  minimumOrder: number | null;
  deliveryInfo: string | null;
  sourceUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type MenuProduct = {
  id: number;
  name: string;
  description: string | null;
  /** Latest price from the `product_price` time-series. */
  price: number | null;
  currency: string;
  /** `product.is_offer` — the product is part of an offer/promotion. */
  isOffer: boolean;
};

export type MenuCategory = {
  id: number | null;
  name: string;
  itemCount: number | null;
  products: MenuProduct[];
};

export type OfferTimeSeriesPoint = {
  effectiveAt: string;
  /** "active" / "inactive", derived from `offer_snapshot.is_active`. */
  status: string;
  /** Price captured for that scrape session (from `product_price`). */
  price: number | null;
};

/**
 * A status change in an offer's lifecycle: the scrape that first recorded the
 * offer becoming active or inactive. Consecutive same-status scrapes are
 * collapsed, so this is the "activated on / went inactive on" timeline.
 */
export type OfferStatusTransition = {
  /** "active" / "inactive", derived from `offer_snapshot.is_active`. */
  status: string;
  /** When this status first took effect (the scrape that recorded the change). */
  effectiveAt: string;
  /** Price captured at that transition (from `product_price`). */
  price: number | null;
};

/** Full time series for one offer of a restaurant (chart + event history). */
export type OfferHistory = {
  offerId: number;
  offerName: string;
  active: boolean;
  /** Every recorded scrape point — used to draw the price chart. */
  points: OfferTimeSeriesPoint[];
  /** Status-change events only — used for the readable history table. */
  transitions: OfferStatusTransition[];
};

export type RestaurantDetail = {
  restaurant: RestaurantInfo;
  activeOffers: CompetitionOfferRow[];
  menu: MenuCategory[];
  offerHistories: OfferHistory[];
};

// --- Dashboard ---

export type ProcessorOfferStats = {
  processorId: number;
  processorName: string;
  activeOffers: number;
  restaurantsWithOffers: number;
};

export type RecentOfferChange = {
  offerId: number;
  offerName: string | null;
  restaurantId: number | null;
  restaurantName: string | null;
  processorName: string | null;
  /** "active" / "inactive", derived from `offer_snapshot.is_active`. */
  status: string;
  price: number | null;
  currency: string;
  effectiveAt: string;
};

export type DashboardStats = {
  totals: {
    restaurants: number;
    products: number;
    offers: number;
    activeOffers: number;
  };
  activeOffersByProcessor: ProcessorOfferStats[];
  recentChanges: RecentOfferChange[];
};

// --- Shared formatting helpers (browser-safe) ---

export function formatCompetitionMoney(
  value: number | null | undefined,
  currency: string | null | undefined,
) {
  if (value === null || value === undefined) {
    return "—";
  }

  if (!currency) {
    return value.toFixed(2);
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    // Unknown/non-ISO currency codes coming from the scraper.
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** Formats a UTC ISO timestamp in the viewer's locale; "—" when missing. */
export function formatCompetitionDateTime(iso: string | null | undefined) {
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
