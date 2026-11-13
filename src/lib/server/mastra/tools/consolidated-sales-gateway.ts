import type { GatewayOutcome } from "./forecast-gateway";

/**
 * Seam between the consolidated-sales assistant tools and the app services in
 * src/lib/services/*.server.ts (which import $lib/$env, forbidden under
 * src/lib/server/mastra/). The app installs the implementation from
 * src/hooks.server.ts (src/lib/server/consolidated-sales-gateway.server.ts); without it the
 * tools fail closed. Imports here are type-only or relative.
 */
export interface ConsolidatedSalesGateway {
  /** Placeholder until the typed tools land; replace with real methods. */
  ping(): Promise<GatewayOutcome<true>>;
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
