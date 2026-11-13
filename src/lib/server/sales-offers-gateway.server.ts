import {
  getSalesOffersGateway,
  setSalesOffersGateway,
  type SalesOffersGateway,
} from "$lib/server/mastra/tools/sales-offers-gateway";

/**
 * SvelteKit-side implementation of the sales-offers assistant gateway
 * (src/lib/server/mastra/tools/sales-offers-gateway.ts). Wraps the page services;
 * installed once from src/hooks.server.ts.
 */
export function createSalesOffersGateway(): SalesOffersGateway {
  return {
    ping: async () => ({ ok: true, value: true }),
  };
}

/** Idempotent: keeps an already-installed gateway (dev HMR, tests). */
export function installSalesOffersGateway(): void {
  if (!getSalesOffersGateway())
    setSalesOffersGateway(createSalesOffersGateway());
}
