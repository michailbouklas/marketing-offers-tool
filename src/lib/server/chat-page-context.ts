import type {
  ForecastPageContext,
  GoogleAnalyticsPageContext,
  GoogleAnalyticsScopeEntry,
} from "$lib/server/mastra/chat-registry";
import { isForecastHorizon } from "$lib/services/forecasts/forecast-types";
import { googleAnalyticsRangeOptions } from "$lib/services/google-analytics/google-analytics";

/**
 * Normalises the optional `context` object the chat widget sends (the Sales
 * Forecasts page filters) into a {@link ForecastPageContext} the agent can
 * read. Everything is a hint for defaults only, so bad values are dropped
 * rather than rejected:
 *
 * - `brand` must be one of the caller's scoped aliases, otherwise it (and the
 *   store, which is meaningless without a brand) is nulled;
 * - `location` must be a positive integer;
 * - `horizon` must be one of the page's horizons (7/14/30/90);
 * - `models` keeps only short strings, at most six.
 *
 * Returns null when the payload is not an object at all.
 */
export const PAGE_CONTEXT_MAX_MODELS = 6;
const MAX_ALIAS_LENGTH = 64;

export function resolvePageContext(
  raw: unknown,
  scopedAliases: readonly string[],
): ForecastPageContext | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const input = raw as Record<string, unknown>;

  const allowed = new Set(
    scopedAliases.map((alias) => alias.trim().toLowerCase()),
  );
  const rawBrand =
    typeof input.brand === "string" ? input.brand.trim().toLowerCase() : "";
  const brand =
    rawBrand.length > 0 &&
    rawBrand.length <= MAX_ALIAS_LENGTH &&
    allowed.has(rawBrand)
      ? rawBrand
      : null;

  const rawLocation = input.location;
  const location =
    brand !== null &&
    typeof rawLocation === "number" &&
    Number.isSafeInteger(rawLocation) &&
    rawLocation > 0
      ? rawLocation
      : null;

  const rawHorizon = input.horizon;
  const horizon =
    typeof rawHorizon === "number" && isForecastHorizon(rawHorizon)
      ? rawHorizon
      : null;

  const models = Array.isArray(input.models)
    ? input.models
        .filter(
          (entry): entry is string =>
            typeof entry === "string" &&
            entry.trim().length > 0 &&
            entry.length <= MAX_ALIAS_LENGTH,
        )
        .map((entry) => entry.trim())
        .slice(0, PAGE_CONTEXT_MAX_MODELS)
    : [];

  return { brand, location, horizon, models };
}

/**
 * Normalises the `context` object the `/google-analytics` chat widget sends
 * (brand id, property row id, range) into a {@link GoogleAnalyticsPageContext}.
 * Hints only, so bad values are dropped, never rejected:
 *
 * - `brand` must be a brand id present in the published GA scope;
 * - `property` must be a property row id in the scope AND belong to that
 *   brand (when a brand survived) — otherwise it is nulled;
 * - `range` must be one of the page's presets ("7d" | "28d" | "90d").
 *
 * Returns null when the payload is not an object at all.
 */
export function resolveGoogleAnalyticsPageContext(
  raw: unknown,
  scope: readonly GoogleAnalyticsScopeEntry[],
): GoogleAnalyticsPageContext | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const input = raw as Record<string, unknown>;

  const rawBrand = input.brand;
  const brandCandidate =
    typeof rawBrand === "number" && Number.isSafeInteger(rawBrand)
      ? rawBrand
      : typeof rawBrand === "string" && /^\d{1,12}$/.test(rawBrand.trim())
        ? Number.parseInt(rawBrand.trim(), 10)
        : null;
  const brandId =
    brandCandidate !== null &&
    scope.some((entry) => entry.brandId === brandCandidate)
      ? brandCandidate
      : null;

  const rawProperty =
    typeof input.property === "string" ? input.property.trim() : "";
  const propertyEntry =
    rawProperty.length > 0 && rawProperty.length <= MAX_ALIAS_LENGTH
      ? scope.find(
          (entry) =>
            entry.propertyRowId === rawProperty &&
            (brandId === null || entry.brandId === brandId),
        )
      : undefined;

  const rawRange = typeof input.range === "string" ? input.range.trim() : "";
  const range = (googleAnalyticsRangeOptions as readonly string[]).includes(
    rawRange,
  )
    ? rawRange
    : null;

  return {
    brandId: propertyEntry ? propertyEntry.brandId : brandId,
    propertyRowId: propertyEntry?.propertyRowId ?? null,
    range,
  };
}
