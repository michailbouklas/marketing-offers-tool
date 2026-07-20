/**
 * Browser-safe constants + parser for the persisted aggregator choice.
 *
 * The `/aggregator-kpis` period pages are single-aggregator by nature (each reads
 * one platform's views), so the chosen platform is kept in a cookie rather than a
 * per-page URL param — this lets the choice persist across every KPI page and
 * survive reloads. Mirrors the sidebar-cookie precedent in
 * `src/lib/components/ui/sidebar/constants.js`.
 *
 * Imported by both the client singleton (`state/aggregator.svelte.ts`) and the
 * server resolver (`period-shared.server.ts`), so it stays free of server imports.
 */
import {
  aggregators,
  type AggregatorValue,
} from "$lib/services/aggregator-kpis/aggregator-kpis";

/** Cookie name holding the selected aggregator platform. */
export const AGGREGATOR_COOKIE = "kpi_aggregator";

/** Cookie lifetime: ~1 year, matching the sidebar cookie. */
export const AGGREGATOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Platform used when no valid cookie is present. */
export const DEFAULT_AGGREGATOR: AggregatorValue = "FOODY";

/** Coerces a raw cookie value to a known aggregator, defaulting to Foody. */
export function parseAggregatorValue(
  raw: string | null | undefined,
): AggregatorValue {
  return aggregators.includes(raw as AggregatorValue)
    ? (raw as AggregatorValue)
    : DEFAULT_AGGREGATOR;
}
