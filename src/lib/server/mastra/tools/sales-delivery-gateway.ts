import type { GatewayOutcome } from "./forecast-gateway";

/**
 * Seam between the sales-delivery assistant tools and the app services in
 * src/lib/services/*.server.ts (which import $lib/$env, forbidden under
 * src/lib/server/mastra/). The app installs the implementation from
 * src/hooks.server.ts (src/lib/server/sales-delivery-gateway.server.ts); without it the
 * tools fail closed. Imports here are type-only or relative.
 */
export interface SalesDeliveryGateway {
  /** Placeholder until the typed tools land; replace with real methods. */
  ping(): Promise<GatewayOutcome<true>>;
}

const globalForSalesDeliveryGateway = globalThis as typeof globalThis & {
  salesDeliveryGateway?: SalesDeliveryGateway | null;
};

export function setSalesDeliveryGateway(
  gateway: SalesDeliveryGateway | null,
): void {
  globalForSalesDeliveryGateway.salesDeliveryGateway = gateway;
}

export function getSalesDeliveryGateway(): SalesDeliveryGateway | null {
  return globalForSalesDeliveryGateway.salesDeliveryGateway ?? null;
}
