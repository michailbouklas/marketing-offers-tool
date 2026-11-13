import {
  getConsolidatedSalesGateway,
  setConsolidatedSalesGateway,
  type ConsolidatedSalesGateway,
} from "$lib/server/mastra/tools/consolidated-sales-gateway";

/**
 * SvelteKit-side implementation of the consolidated-sales assistant gateway
 * (src/lib/server/mastra/tools/consolidated-sales-gateway.ts). Wraps the page services;
 * installed once from src/hooks.server.ts.
 */
export function createConsolidatedSalesGateway(): ConsolidatedSalesGateway {
  return {
    ping: async () => ({ ok: true, value: true }),
  };
}

/** Idempotent: keeps an already-installed gateway (dev HMR, tests). */
export function installConsolidatedSalesGateway(): void {
  if (!getConsolidatedSalesGateway())
    setConsolidatedSalesGateway(createConsolidatedSalesGateway());
}
