import type { AppPermissions } from "$lib/auth/permissions";

/**
 * Config for a chat agent the API is allowed to route to.
 *
 * - `permissions` — the permission a user must hold to talk to the agent.
 *   Omit it to allow ANY authenticated user (used for agents whose page is
 *   gated by `requireAuthenticatedUser` rather than a capability, e.g. the
 *   `/offers-data-quality` data-quality assistant).
 * - `brandScoped` — when true, the chat endpoint resolves the caller's
 *   assigned brands and passes their aliases to the agent so its answers are
 *   limited to those brands. The brand list is always derived server-side
 *   from the authenticated user, never trusted from the request body.
 */
export type ChatAgentConfig = {
  permissions?: AppPermissions;
  brandScoped?: boolean;
};

/**
 * RuntimeContext key under which the chat endpoint publishes the caller's
 * assigned brand aliases for `brandScoped` agents. The agent reads it in its
 * dynamic instructions to constrain every query to those brands. Kept here
 * (not in the agent module) so the endpoint can import it without eagerly
 * constructing an Agent.
 */
export const BRAND_SCOPE_RUNTIME_KEY = "allowedBrandAliases";

/**
 * Companion RequestContext key carrying the display names of the same brands
 * (index-aligned with the aliases). Brand-scoped agents use it to answer
 * "which are my brands?" with friendly names instead of raw codes.
 */
export const BRAND_SCOPE_NAMES_RUNTIME_KEY = "allowedBrandNames";

/**
 * Chat agents the API is allowed to route to, and the permission (if any) a
 * user must hold to talk to each one. The chat widget picks the agent for its
 * section; this map is the server-side allowlist backing that routing.
 */
export const chatAgents: Record<string, ChatAgentConfig> = {
  "invoices-agent": {
    permissions: { aggregatorInvoices: ["view"] },
  },
  "google-reviews-agent": {
    permissions: { googleReviews: ["view"] },
  },
  "competition-agent": {
    permissions: { competition: ["view"] },
  },
  // Available to any authenticated user — the `/offers-data-quality` route is
  // gated only by `requireAuthenticatedUser`, so the assistant matches that.
  // Brand-scoped: answers are limited to the caller's assigned brands.
  "offers-data-quality-agent": {
    brandScoped: true,
  },
  // Brand-scoped on top of the permission gate: answers are limited to the
  // caller's assigned brands (superUser/admin get all active brands).
  "sales-agent": {
    permissions: { sales: ["view"] },
    brandScoped: true,
  },
};
