/**
 * Browser-safe types and constants for the `/google-reviews` section.
 * Server-only ClickHouse / Prisma queries live in the sibling `*.server.ts`
 * modules.
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

export const sentimentValues = ["positive", "negative", "neutral"] as const;

export type SentimentValue = (typeof sentimentValues)[number];

export const googleReviewsPrefStates = ["monitored", "ignored"] as const;

export type GoogleReviewsPrefStateValue =
  (typeof googleReviewsPrefStates)[number];

export const googleReviewsSortDirections = ["asc", "desc"] as const;

export type GoogleReviewsSortDirection =
  (typeof googleReviewsSortDirections)[number];

// --- Reviews list ---

export const reviewSortFields = [
  "review_date",
  "rating",
  "reviewer_name",
  "business_title",
  "sentiment",
] as const;

export type ReviewSortField = (typeof reviewSortFields)[number];

export type GoogleReviewRow = {
  id: number;
  businessCid: string | null;
  businessTitle: string | null;
  reviewerName: string;
  rating: number;
  reviewText: string | null;
  reviewDate: string | null;
  /** Lowercased sentiment label; null when the review is not yet analyzed. */
  sentiment: string | null;
  sentimentCertainty: number | null;
};

// --- Businesses list ---

export const businessSortFields = [
  "title",
  "category",
  "average_rating",
  "review_count",
  "negative_count",
] as const;

export type BusinessSortField = (typeof businessSortFields)[number];

export type GoogleBusinessRow = {
  cid: string;
  title: string;
  category: string | null;
  address: string | null;
  averageRating: number | null;
  reviewCount: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  isMonitored?: boolean;
};

// --- Business detail ---

export type BusinessProfile = {
  cid: string;
  title: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  status: string | null;
  description: string | null;
  thumbnail: string | null;
  priceRange: string | null;
  latitude: number | null;
  longitude: number | null;
  reviewsLink: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type StarBucket = {
  stars: number;
  count: number;
};

export type StarBreakdown = {
  reviewCount: number;
  averageRating: number | null;
  buckets: StarBucket[];
};

export type ReviewCategoryMetric = {
  categoryId: number;
  category: string;
  reviewCount: number;
  percentage: number | null;
};

// --- Negative review categories ---

export const negativeCategorySortFields = [
  "business_count",
  "negative_review_count",
  "category",
] as const;

export type NegativeCategorySortField =
  (typeof negativeCategorySortFields)[number];

export type NegativeReviewCategoryRow = {
  categoryId: number;
  category: string;
  /** Distinct businesses with at least one negative review in this category. */
  businessCount: number;
  negativeReviewCount: number;
};

export type BusinessSentimentMetrics = {
  totalReviews: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  positivePercentage: number | null;
  negativePercentage: number | null;
  neutralPercentage: number | null;
  sentimentScore: number | null;
  lastUpdated: string | null;
};

export type BusinessFeature = {
  category: string;
  name: string;
  isEnabled: boolean | null;
};

export type OperatingHour = {
  dayOfWeek: string;
  hours: string;
};

export type OrderingOption = {
  platformName: string;
  orderUrl: string;
};

export type BusinessDetail = {
  profile: BusinessProfile;
  starBreakdown: StarBreakdown | null;
  sentiment: BusinessSentimentMetrics | null;
  recentReviews: GoogleReviewRow[];
  features: BusinessFeature[];
  operatingHours: OperatingHour[];
  orderingOptions: OrderingOption[];
  categories: ReviewCategoryMetric[];
  reviewsPerDay: TimeseriesPoint[];
  avgRatingPerDay: TimeseriesPoint[];
  sentimentPerDay: SentimentTimeseriesPoint[];
};

// --- Dashboard ---

export type TimeseriesPoint = {
  /** UTC day, "YYYY-MM-DD". */
  day: string;
  value: number;
};

export type SentimentTimeseriesPoint = {
  /** UTC day, "YYYY-MM-DD". */
  day: string;
  positive: number;
  neutral: number;
  negative: number;
};

export type SentimentBucket = {
  sentiment: SentimentValue;
  count: number;
};

export type TopBusinessRow = {
  cid: string;
  title: string;
  averageRating: number | null;
  reviewCount: number;
};

export type GoogleReviewsDashboardStats = {
  totals: {
    businesses: number;
    reviews: number;
    averageRating: number | null;
    negativeCount: number;
    /** Share of analyzed reviews that are negative; null when none analyzed. */
    negativePercentage: number | null;
  };
  reviewsPerDay: TimeseriesPoint[];
  avgRatingPerDay: TimeseriesPoint[];
  starDistribution: StarBucket[];
  sentimentDistribution: SentimentBucket[];
  topBusinesses: TopBusinessRow[];
};

// --- Shared formatting helpers (browser-safe) ---

/** Formats a UTC ISO timestamp in the viewer's locale; "—" when missing. */
export function formatGoogleReviewsDateTime(iso: string | null | undefined) {
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

/** Average rating with one decimal, e.g. "4.3"; "—" when missing. */
export function formatRating(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }

  return value.toFixed(1);
}

/** Capitalized sentiment label, e.g. "Positive"; "—" when not analyzed. */
export function formatSentimentLabel(sentiment: string | null | undefined) {
  if (!sentiment) {
    return "—";
  }

  return sentiment.charAt(0).toUpperCase() + sentiment.slice(1).toLowerCase();
}

/** Badge color classes per sentiment, matching the shadcn Badge variants. */
export function sentimentBadgeClass(sentiment: string | null | undefined) {
  switch (sentiment?.toLowerCase()) {
    case "positive":
      return "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    case "negative":
      return "border-transparent bg-red-500/15 text-red-700 dark:text-red-400";
    case "neutral":
      return "border-transparent bg-zinc-500/15 text-zinc-700 dark:text-zinc-300";
    default:
      return "";
  }
}
