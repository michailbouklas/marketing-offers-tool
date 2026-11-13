import type {
  CompareMetric,
  OfferCalendarRow,
  OfferDateRange,
  OfferSlot,
  OfferSlotSale,
  OfferValue,
  OfferWeek,
} from "../../../services/sales-offers";
import type { GatewayOutcome } from "./forecast-gateway";

/**
 * Seam between the sales-offers assistant tools and the app services in
 * src/lib/services/*.server.ts (which import $lib/$env, forbidden under
 * src/lib/server/mastra/). The app installs the implementation from
 * src/hooks.server.ts (src/lib/server/sales-offers-gateway.server.ts); without it the
 * tools fail closed. Imports here are type-only or relative.
 */

/** Optional page filters: channels (trimmed POS channel names), POS location ids. */
export type OfferFilters = {
  range: OfferDateRange | null;
  channels: string[];
  locations: number[];
};

/** Offers of one brand valued exactly like /sales/offers. */
export type OfferValuesResult = {
  source: "cache" | "live";
  offers: OfferValue[];
  /** ISO timestamp the numbers were computed at (cache build time when cached). */
  computedAt: string;
  /** Brand ideal FC % (fraction) the verdicts were measured against. */
  idealFcPerc: number | null;
};

/** One offer of the Offer VS / detail dialog. */
export type OfferProfile = {
  value: OfferValue;
  /** Plain-language reason for the verdict (offerReason). */
  reason: string;
  /** Share of units per weekday, Monday first (weekdayMix). */
  weekdayMix: number[];
  weeks: OfferWeek[];
};

export type OfferComparison = {
  source: "cache" | "live";
  computedAt: string;
  idealFcPerc: number | null;
  offers: OfferProfile[];
  /** Codes asked for that have no sales under these filters. */
  missing: string[];
  /** Offer VS rows (offerCompareMetrics + compareWinner) when two offers were found. */
  metrics: (CompareMetric & { winner: "a" | "b" | null })[] | null;
};

export interface SalesOffersGateway {
  /** Channels + locations sold by the brand (inside the range, or all history). */
  listFilterOptions(
    brand: string,
    range: OfferDateRange | null,
  ): Promise<
    GatewayOutcome<{
      channels: string[];
      locations: { id: number; name: string }[];
    }>
  >;
  /** Postgres cache (all time, all channels/locations); null when never built. */
  getCachedOfferValues(
    brand: string,
  ): Promise<GatewayOutcome<OfferValuesResult | null>>;
  /** Live ClickHouse valuation. The range is required: all time comes from the cache. */
  getLiveOfferValues(
    brand: string,
    filters: OfferFilters & { range: OfferDateRange },
  ): Promise<GatewayOutcome<OfferValuesResult>>;
  /** Offer detail / Offer VS for 1-2 codes; values from the cache when filters are empty. Null when the cache is empty. */
  compareOffers(
    brand: string,
    codes: string[],
    filters: OfferFilters,
  ): Promise<GatewayOutcome<OfferComparison | null>>;
  /** All offers combined per business day x order hour (offers calendar). */
  getOfferCalendarRows(
    brand: string,
    filters: OfferFilters & { range: OfferDateRange },
  ): Promise<GatewayOutcome<OfferCalendarRow[]>>;
  /** Per-offer totals inside one calendar cell, best net first. */
  getOfferSlotSales(
    brand: string,
    filters: OfferFilters & { range: OfferDateRange },
    slot: OfferSlot,
  ): Promise<GatewayOutcome<OfferSlotSale[]>>;
}

const globalForSalesOffersGateway = globalThis as typeof globalThis & {
  salesOffersGateway?: SalesOffersGateway | null;
};

export function setSalesOffersGateway(
  gateway: SalesOffersGateway | null,
): void {
  globalForSalesOffersGateway.salesOffersGateway = gateway;
}

export function getSalesOffersGateway(): SalesOffersGateway | null {
  return globalForSalesOffersGateway.salesOffersGateway ?? null;
}
