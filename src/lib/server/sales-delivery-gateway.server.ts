import {
  getSalesDeliveryGateway,
  setSalesDeliveryGateway,
  type SalesDeliveryGateway,
} from "$lib/server/mastra/tools/sales-delivery-gateway";

/**
 * SvelteKit-side implementation of the sales-delivery assistant gateway
 * (src/lib/server/mastra/tools/sales-delivery-gateway.ts). Wraps the page services;
 * installed once from src/hooks.server.ts.
 */
export function createSalesDeliveryGateway(): SalesDeliveryGateway {
  return {
    ping: async () => ({ ok: true, value: true }),
  };
}

/** Idempotent: keeps an already-installed gateway (dev HMR, tests). */
export function installSalesDeliveryGateway(): void {
  if (!getSalesDeliveryGateway())
    setSalesDeliveryGateway(createSalesDeliveryGateway());
}
