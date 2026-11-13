import type {
  ConsolidatedReport,
  ConsolidatedStoreOption,
} from "../../../services/sales-consolidated";
import type { GatewayOutcome } from "./forecast-gateway";

/**
 * Seam between the consolidated-sales assistant tools and the app services in
 * src/lib/services/*.server.ts (which import $lib/$env, forbidden under
 * src/lib/server/mastra/). The app installs the implementation from
 * src/hooks.server.ts (src/lib/server/consolidated-sales-gateway.server.ts); without it the
 * tools fail closed. Imports here are type-only or relative.
 */

/** Tool input, brands already authorised against the caller's scope. */
export type ConsolidatedSalesQuery = {
  /** Lowercase aliases the caller may see (the page's brand scope). */
  scopeBrands: string[];
  /** Lowercase aliases to report on; empty = every scoped brand. */
  brands: string[];
  /** ISO dates; null = the page default (last 30 days to the latest loaded day). */
  from: string | null;
  to: string | null;
  channels: string[];
  stores: string[];
  cities: string[];
  /** ISO weekdays, 1 = Monday. */
  weekdays: number[];
};

/** The filters the page services actually ran with (after defaults + clamping). */
export type ConsolidatedResolvedFilters = {
  brands: string[];
  from: string;
  to: string;
};

export type ConsolidatedOptions = {
  channels: string[];
  stores: ConsolidatedStoreOption[];
  cities: string[];
};

export interface ConsolidatedSalesGateway {
  /** Filter options for the brands + date window (same as the page's dropdowns). */
  getOptions(query: ConsolidatedSalesQuery): Promise<
    GatewayOutcome<{
      filters: ConsolidatedResolvedFilters;
      options: ConsolidatedOptions;
    }>
  >;
  /** The page's company -> store report with subtotals and grand total. */
  getReport(query: ConsolidatedSalesQuery): Promise<
    GatewayOutcome<{
      filters: ConsolidatedResolvedFilters;
      report: ConsolidatedReport;
    }>
  >;
}

const globalForConsolidatedSalesGateway = globalThis as typeof globalThis & {
  consolidatedSalesGateway?: ConsolidatedSalesGateway | null;
};

export function setConsolidatedSalesGateway(
  gateway: ConsolidatedSalesGateway | null,
): void {
  globalForConsolidatedSalesGateway.consolidatedSalesGateway = gateway;
}

export function getConsolidatedSalesGateway(): ConsolidatedSalesGateway | null {
  return globalForConsolidatedSalesGateway.consolidatedSalesGateway ?? null;
}
