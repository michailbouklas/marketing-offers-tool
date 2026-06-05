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

/** Aggregator platform (Wolt, Foody, ...) — `processors` in the replica. */
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
  "discount_value",
  "resulting_price",
  "created_at",
] as const;

export type OfferSortField = (typeof offerSortFields)[number];

export const competitionSortDirections = ["asc", "desc"] as const;

export type CompetitionSortDirection =
  (typeof competitionSortDirections)[number];

export type CompetitionOfferRow = {
  id: number;
  name: string;
  description: string | null;
  discountType: string;
  discountValue: number | null;
  resultingPrice: number | null;
  currency: string;
  /**
   * When the scraper first saw the offer. The aggregator-provided
   * `starts_at` / `ends_at` windows are currently always NULL in the replica,
   * so "first seen" is the reliable time dimension.
   */
  createdAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  restaurantId: number;
  restaurantName: string | null;
  processorId: number;
  processorName: string | null;
};

// --- Restaurants list ---

export const restaurantSortFields = [
  "name",
  "processor_name",
  "brand",
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
  brand: string | null;
  address: string | null;
  rating: number | null;
  deliveryFee: number | null;
  minimumOrder: number | null;
  deliveryTime: string | null;
  cuisineTypes: string;
  activeOfferCount: number;
  trackState: CompetitionTrackStateValue | null;
};

// --- Restaurant detail ---

export type RestaurantInfo = {
  id: number;
  externalId: string;
  name: string;
  processorId: number;
  processorName: string | null;
  brand: string | null;
  address: string | null;
  phone: string | null;
  rating: number | null;
  deliveryFee: number | null;
  minimumOrder: number | null;
  deliveryTime: string | null;
  cuisineTypes: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type MenuProduct = {
  id: number;
  name: string;
  description: string | null;
  price: number | null;
  originalPrice: number | null;
  currency: string;
  discountPercentage: number | null;
  available: boolean;
  offerName: string | null;
  imageUrl: string | null;
};

export type MenuCategory = {
  id: number | null;
  name: string;
  displayOrder: number | null;
  products: MenuProduct[];
};

export type OfferTimeSeriesPoint = {
  effectiveAt: string;
  status: string;
  discountValue: number | null;
  resultingPrice: number | null;
};

/** Full time series for one offer of a restaurant (chart + event history). */
export type OfferHistory = {
  offerId: number;
  offerName: string;
  active: boolean;
  points: OfferTimeSeriesPoint[];
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
  status: string;
  discountValue: number | null;
  resultingPrice: number | null;
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

/**
 * Human label for an offer discount, e.g. "20%" / "−2.50 €" / the raw type
 * when no value is present.
 */
export function formatCompetitionDiscount(
  discountType: string | null | undefined,
  discountValue: number | null | undefined,
  currency?: string | null,
) {
  if (discountValue === null || discountValue === undefined) {
    return discountType ?? "—";
  }

  const normalizedType = (discountType ?? "").toLowerCase();

  if (normalizedType.includes("percent")) {
    return `${discountValue}%`;
  }

  return formatCompetitionMoney(discountValue, currency);
}
