import type { AppPermissions } from "$lib/auth/permissions";

/**
 * Chat agents the API is allowed to route to, and the permission a user
 * must hold to talk to each one. The chat widget picks the agent for its
 * section; this map is the server-side allowlist backing that routing.
 */
export const chatAgents: Record<string, { permissions: AppPermissions }> = {
  "invoices-agent": {
    permissions: { aggregatorInvoices: ["view"] },
  },
};
