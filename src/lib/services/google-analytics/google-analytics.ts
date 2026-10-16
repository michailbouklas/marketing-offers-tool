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

export type GoogleAnalyticsDashboard = {
  totals: GoogleAnalyticsTotals;
  daily: GoogleAnalyticsDailyPoint[];
  channels: GoogleAnalyticsBreakdownRow[];
  pages: GoogleAnalyticsBreakdownRow[];
  devices: GoogleAnalyticsBreakdownRow[];
  countries: GoogleAnalyticsBreakdownRow[];
};

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
