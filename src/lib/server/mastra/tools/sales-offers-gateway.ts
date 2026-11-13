import type { GatewayOutcome } from "./forecast-gateway";

/**
 * Seam between the sales-offers assistant tools and the app services in
 * src/lib/services/*.server.ts (which import $lib/$env, forbidden under
 * src/lib/server/mastra/). The app installs the implementation from
 * src/hooks.server.ts (src/lib/server/sales-offers-gateway.server.ts); without it the
 * tools fail closed. Imports here are type-only or relative.
 */
export interface SalesOffersGateway {
  /** Placeholder until the typed tools land; replace with real methods. */
  ping(): Promise<GatewayOutcome<true>>;
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
