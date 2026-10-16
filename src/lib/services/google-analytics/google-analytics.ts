import { z } from "zod";
import type { BrandOption } from "$lib/services/brands";

/**
 * Browser-safe types and helpers for the `/google-analytics` section and the
 * admin "Google Analytics properties" card. Server-only code (Prisma, the GA4
 * Data API client, credential decryption) lives in the sibling `*.server.ts`
 * modules — nothing here may import them.
 */

// --- Date range ---------------------------------------------------------------

export const googleAnalyticsRangeOptions = ["7d", "28d", "90d"] as const;

export type GoogleAnalyticsRange = (typeof googleAnalyticsRangeOptions)[number];

export const defaultGoogleAnalyticsRange: GoogleAnalyticsRange = "28d";

export const googleAnalyticsRangeLabels: Record<GoogleAnalyticsRange, string> =
  {
    "7d": "Last 7 days",
    "28d": "Last 28 days",
    "90d": "Last 90 days",
  };

export const googleAnalyticsRangeDays: Record<GoogleAnalyticsRange, number> = {
  "7d": 7,
  "28d": 28,
  "90d": 90,
};

export function parseGoogleAnalyticsRange(
  value: string | null | undefined,
): GoogleAnalyticsRange {
  return (googleAnalyticsRangeOptions as readonly string[]).includes(
    value ?? "",
  )
    ? (value as GoogleAnalyticsRange)
    : defaultGoogleAnalyticsRange;
}

// --- Properties ---------------------------------------------------------------

/** What the dashboard page receives: never credentials. */
export type GoogleAnalyticsPropertyRef = {
  /** Row id (cuid) — used in URLs so the numeric GA4 id is never the key. */
  id: string;
  /** Numeric GA4 property id (digits only). */
  propertyId: string;
  displayName: string;
};

/** Admin card row: display-only credential metadata, never the key itself. */
export type GoogleAnalyticsPropertyAdminRow = GoogleAnalyticsPropertyRef & {
  active: boolean;
  sortOrder: number;
  clientEmail: string;
  keyId: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  createdAt: string;
};

/** A brand the user may view, with its active properties. */
export type GoogleAnalyticsBrandScope = {
  brand: BrandOption;
  properties: GoogleAnalyticsPropertyRef[];
};

/**
 * Accepts `properties/123456`, `123456` or padded variants and returns the
 * digits, or null when the input is not a GA4 property id.
 */
export function normalizeGoogleAnalyticsPropertyId(
  input: string | null | undefined,
): string | null {
  const trimmed = (input ?? "").trim().replace(/^properties\//i, "");

  return /^\d{1,20}$/.test(trimmed) ? trimmed : null;
}

// --- Service-account credentials -------------------------------------------------

/**
 * The subset of a Google service-account JSON key we store. Parsing through
 * this schema drops every other field, so the encrypted blob holds only what
 * the OAuth JWT flow needs.
 */
export const serviceAccountCredentialsSchema = z.object({
  type: z.literal("service_account", {
    error: 'Expected a service-account key ("type": "service_account")',
  }),
  client_email: z.email({ error: "client_email must be an email address" }),
  private_key: z.string().refine((value) => value.includes("PRIVATE KEY"), {
    error: "private_key must be a PEM-encoded private key",
  }),
  private_key_id: z.string().optional(),
  token_uri: z.url().optional(),
  project_id: z.string().optional(),
});

export type ServiceAccountCredentials = z.infer<
  typeof serviceAccountCredentialsSchema
>;

export type ParsedServiceAccount =
  | { ok: true; value: ServiceAccountCredentials }
  | { ok: false; error: string };

export function parseServiceAccountJson(raw: string): ParsedServiceAccount {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Credentials must be valid JSON" };
  }

  const result = serviceAccountCredentialsSchema.safeParse(parsed);

  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues.map((issue) => issue.message).join("; "),
    };
  }

  return { ok: true, value: result.data };
}

// --- URL filters ------------------------------------------------------------------

export type GoogleAnalyticsFilters = {
  brandId: number | null;
  /** Property row id (cuid), not the numeric GA4 id. */
  propertyId: string | null;
  range: GoogleAnalyticsRange;
};

export function parseGoogleAnalyticsFilters(
  searchParams: URLSearchParams,
): GoogleAnalyticsFilters {
  const rawBrand = searchParams.get("brand");
  const brandId =
    rawBrand && /^\d+$/.test(rawBrand) ? Number.parseInt(rawBrand, 10) : null;
  const rawProperty = searchParams.get("property")?.trim() ?? "";

  return {
    brandId: brandId !== null && brandId > 0 ? brandId : null,
    propertyId: rawProperty.length > 0 ? rawProperty : null,
    range: parseGoogleAnalyticsRange(searchParams.get("range")),
  };
}

export function buildGoogleAnalyticsHref(
  basePath: string,
  filters: GoogleAnalyticsFilters,
): string {
  const params = new URLSearchParams();

  if (filters.brandId !== null) {
    params.set("brand", String(filters.brandId));
  }

  if (filters.propertyId) {
    params.set("property", filters.propertyId);
  }

  if (filters.range !== defaultGoogleAnalyticsRange) {
    params.set("range", filters.range);
  }

  const search = params.toString();

  return search ? `${basePath}?${search}` : basePath;
}

// --- Dashboard model ---------------------------------------------------------------

export type GoogleAnalyticsTotals = {
  activeUsers: number;
  newUsers: number;
  sessions: number;
  /** Fraction 0..1 as returned by GA4 (`engagementRate`). */
  engagementRate: number;
  averageSessionDurationSeconds: number;
  keyEvents: number;
  screenPageViews: number;
};

export type GoogleAnalyticsDailyPoint = {
  /** ISO date (YYYY-MM-DD). */
  day: string;
  activeUsers: number;
  sessions: number;
};

export type GoogleAnalyticsBreakdownRow = {
  label: string;
  sessions: number;
  activeUsers: number;
};

export type GoogleAnalyticsCampaignRow = {
  /** `sessionSourceMedium`, e.g. "google / cpc" or "(direct) / (none)". */
  sourceMedium: string;
  /** `sessionCampaignName`, "(not set)" when no UTM campaign. */
  campaign: string;
  sessions: number;
  engagementRate: number;
  keyEvents: number;
};

export type GoogleAnalyticsLandingPageRow = {
  path: string;
  sessions: number;
  newUsers: number;
  /** userEngagementDuration ÷ sessions. */
  avgEngagementSeconds: number;
  keyEvents: number;
};

export type GoogleAnalyticsHeatmapCell = {
  /** GA4 `dayOfWeek`: 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
  /** 0–23. */
  hour: number;
  sessions: number;
};

export type GoogleAnalyticsAudienceSegment = {
  /** `newVsReturning`: "new", "returning" or "(not set)". */
  label: string;
  activeUsers: number;
  sessions: number;
  engagementRate: number;
};

export type GoogleAnalyticsKeyEventRow = {
  eventName: string;
  keyEvents: number;
};

export type GoogleAnalyticsDashboard = {
  totals: GoogleAnalyticsTotals;
  /** Same metrics for the preceding period of equal length; null if absent. */
  previousTotals: GoogleAnalyticsTotals | null;
  daily: GoogleAnalyticsDailyPoint[];
  channels: GoogleAnalyticsBreakdownRow[];
  pages: GoogleAnalyticsBreakdownRow[];
  devices: GoogleAnalyticsBreakdownRow[];
  countries: GoogleAnalyticsBreakdownRow[];
  cities: GoogleAnalyticsBreakdownRow[];
  campaigns: GoogleAnalyticsCampaignRow[];
  landingPages: GoogleAnalyticsLandingPageRow[];
  /** Always 7 × 24 cells (missing combinations filled with 0). */
  heatmap: GoogleAnalyticsHeatmapCell[];
  newVsReturning: GoogleAnalyticsAudienceSegment[];
  keyEventsByName: GoogleAnalyticsKeyEventRow[];
};

// --- Dashboard cache / widget state --------------------------------------------------

/**
 * The reports the dashboard is built from, in request order. Each one is a
 * row in `google_analytics_report_cache` and a widget state on the page;
 * `totals`, `previousTotals` and `daily` all come from the `daily` report.
 */
export const googleAnalyticsDashboardReportKeys = [
  "daily",
  "channels",
  "pages",
  "devices",
  "countries",
  "campaigns",
  "landingPages",
  "heatmap",
  "newVsReturning",
  "keyEventsByName",
  "cities",
] as const;

export type GoogleAnalyticsDashboardReportKey =
  (typeof googleAnalyticsDashboardReportKeys)[number];

export function isGoogleAnalyticsDashboardReportKey(
  value: unknown,
): value is GoogleAnalyticsDashboardReportKey {
  return (googleAnalyticsDashboardReportKeys as readonly unknown[]).includes(
    value,
  );
}

/**
 * Per-widget provenance: `fresh` came from Google within the TTL, `stale` is
 * an older copy served because Google refused the refresh, `pending` means
 * there is no copy at all and a background retry is queued.
 */
export type GoogleAnalyticsWidgetState =
  | { status: "fresh" | "stale"; fetchedAt: string }
  | { status: "pending"; reason: string };

export type GoogleAnalyticsDashboardResult = {
  dashboard: GoogleAnalyticsDashboard;
  widgets: Record<
    GoogleAnalyticsDashboardReportKey,
    GoogleAnalyticsWidgetState
  >;
  /** Widgets with no data yet (subset of keys whose state is `pending`). */
  pendingKeys: GoogleAnalyticsDashboardReportKey[];
};

export type GoogleAnalyticsRefreshJobStatus =
  | "pending"
  | "running"
  | "done"
  | "failed";

/** `GET /api/google-analytics/dashboard-status` — polled while widgets are pending. */
export type GoogleAnalyticsDashboardStatus = {
  pendingKeys: GoogleAnalyticsDashboardReportKey[];
  job: {
    status: GoogleAnalyticsRefreshJobStatus;
    attempts: number;
    nextRunAt: string;
    lastError: string | null;
  } | null;
};

/** "just now", "12 min ago", "3 h ago", "2 days ago" — for the stale-widget note. */
export function formatRelativeAge(
  iso: string,
  now: number = Date.now(),
): string {
  const ageMs = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(ageMs / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

// --- Realtime -----------------------------------------------------------------------

export type GoogleAnalyticsRealtime = {
  /** Active users in the last 30 minutes. */
  activeUsers: number;
  /** 30 entries, minutesAgo 0 (now) … 29. */
  perMinute: { minutesAgo: number; activeUsers: number }[];
  topPages: { title: string; activeUsers: number }[];
  /** ISO timestamp of the Google call. */
  fetchedAt: string;
};

// --- Period comparison --------------------------------------------------------------

export type GoogleAnalyticsDelta = {
  /** Relative change as a fraction (0.124 = +12.4%); null when undefined. */
  pct: number | null;
  direction: "up" | "down" | "flat";
};

export function computeDelta(
  current: number,
  previous: number | null | undefined,
): GoogleAnalyticsDelta {
  if (
    previous === null ||
    previous === undefined ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return { pct: null, direction: "flat" };
  }

  const pct = (current - previous) / previous;

  if (Math.abs(pct) < 0.0005) {
    return { pct: 0, direction: "flat" };
  }

  return { pct, direction: pct > 0 ? "up" : "down" };
}

/** Arrow + signed percent so the direction never relies on colour alone. */
export function formatDeltaLabel(delta: GoogleAnalyticsDelta): string {
  if (delta.pct === null) {
    return "n/a";
  }

  const arrow =
    delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "—";

  return `${arrow} ${Math.abs(delta.pct * 100).toFixed(1)}%`;
}

// --- Formatting --------------------------------------------------------------------

const integerFormatter = new Intl.NumberFormat("en-US");

export function formatInteger(value: number): string {
  return integerFormatter.format(Math.round(value));
}

/** `0.612` → `61.2%`. */
export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/** `134.4` → `2m 14s`; under a minute → `44s`. */
export function formatDurationSeconds(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;

  if (minutes === 0) {
    return `${rest}s`;
  }

  return `${minutes}m ${rest.toString().padStart(2, "0")}s`;
}
