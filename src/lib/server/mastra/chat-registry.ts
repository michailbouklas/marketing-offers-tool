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
  /**
   * When true, the chat endpoint accepts an optional `context` object from
   * the widget (the page's current filters), validates it, drops any brand
   * outside the caller's scope and publishes it under
   * `FORECAST_PAGE_CONTEXT_RUNTIME_KEY`. A hint for defaults only — never an
   * authorisation input.
   */
  pageContext?: boolean;
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
 * RequestContext key naming the surface a conversation comes from. Agents may
 * adapt their instructions per channel — e.g. the Open WebUI bridge cannot
 * serve file downloads, so file-producing tools are described as unavailable
 * there. Absent (the in-app widget) means `"app"`.
 */
export const CHANNEL_RUNTIME_KEY = "channel";

export type ChatChannel = "app" | "openwebui";

/**
 * RequestContext key carrying the Sales Forecasts page filters the user is
 * looking at (brand, store, horizon, selected models) so the Forecasts
 * Assistant can default to them. Published only for agents with
 * `pageContext: true`, after server-side validation.
 */
export const FORECAST_PAGE_CONTEXT_RUNTIME_KEY = "forecastPageContext";

export type ForecastPageContext = {
  /** Brand alias, already checked against the caller's scope (else null). */
  brand: string | null;
  /** `tran_location` id; null = all stores. */
  location: number | null;
  /** 7 | 14 | 30 | 90, or null when the page did not say. */
  horizon: number | null;
  /** Model ids selected on the page (may be empty). */
  models: string[];
};

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
  // Forecasts Assistant on /forecasts: same permission as the page, brand
  // scoped like the sales agent, and it receives the page's filters as hints.
  "forecasts-agent": {
    permissions: { forecasts: ["view"] },
    brandScoped: true,
    pageContext: true,
  },
};
