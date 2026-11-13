import type { AppPermissions } from "$lib/auth/permissions";
import { managementAccountsRoles, type UserRole } from "$lib/auth/roles";

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
  /**
   * Role allowlist, for agents whose page is gated by role rather than a
   * capability permission (e.g. `/management-accounts`). Checked in addition
   * to `permissions` when both are set.
   */
  roles?: UserRole[];
  brandScoped?: boolean;
  /**
   * When true, the chat endpoint accepts an optional `context` object from
   * the widget (the page's current filters), validates it, drops anything
   * outside the caller's scope and publishes it under the agent's page-context
   * key (`FORECAST_PAGE_CONTEXT_RUNTIME_KEY`,
   * `GOOGLE_ANALYTICS_PAGE_CONTEXT_RUNTIME_KEY` or, for `sales-agent`,
   * `SALES_SELECTED_ORDERS_RUNTIME_KEY`). Never an authorisation input.
   */
  pageContext?: boolean;
  /**
   * When true, the chat endpoint publishes the GA4 properties the caller may
   * query under `GOOGLE_ANALYTICS_SCOPE_RUNTIME_KEY`. This is NOT the
   * `brandScoped` list: `/google-analytics` scopes every role (admins
   * included) to its own `user_brand` assignments that have an active GA4
   * property, and the assistant must see exactly what the page shows.
   */
  googleAnalyticsScoped?: boolean;
  /**
   * When true, the chat endpoint publishes the GL companies the caller may
   * query under `MANAGEMENT_ACCOUNTS_SCOPE_RUNTIME_KEY` (the same scope as the
   * `/management-accounts` pages); the SAP SQL tool enforces it.
   */
  managementAccountsScoped?: boolean;
};

/** RequestContext key carrying the caller's `ManagementAccountsScope`. */
export const MANAGEMENT_ACCOUNTS_SCOPE_RUNTIME_KEY = "managementAccountsScope";

/** A SAP warehouse company: `dbo.sapbw_gl.databaseId` + its `companyName`. */
export type GlCompany = { databaseId: string; companyName: string };

/**
 * GL companies a user may see. `all` = admin roles, no filter; otherwise
 * `companies` are those whose `Company.sapDatabaseId` operates one of the
 * user's assigned brands (may be empty).
 */
export type ManagementAccountsScope = { all: boolean; companies: GlCompany[] };

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
 * RequestContext key carrying the orders the user selected in the Sales
 * Explorer grid, with their full lines already read inside the caller's brand
 * scope. Set only when the widget sent valid order pks.
 */
export const SALES_SELECTED_ORDERS_RUNTIME_KEY = "salesSelectedOrders";

export type SalesSelectedOrders = {
  /** The validated order pks (`<date>_<location>_<division>_<no>`). */
  pks: string[];
  /** One row per line, keyed by column label; order columns repeated. */
  lines: Record<string, string | number>[];
  /** Labels of the order-level columns in `lines`. */
  headerLabels: string[];
};

/**
 * RequestContext key carrying the GA4 properties the caller may query (one
 * entry per active property of each assigned brand). Published by the chat
 * endpoint for `googleAnalyticsScoped` agents; the Google Analytics tools
 * authorise every `propertyRowId` against it and fail closed when absent.
 */
export const GOOGLE_ANALYTICS_SCOPE_RUNTIME_KEY = "googleAnalyticsScope";

export type GoogleAnalyticsScopeEntry = {
  brandId: number;
  brandName: string;
  /** `brand_google_analytics_property.id` (cuid) — the handle tools use. */
  propertyRowId: string;
  /** Numeric GA4 property id, for display only. */
  propertyId: string;
  displayName: string;
};

/**
 * RequestContext key carrying the `/google-analytics` filters the user is
 * looking at (brand, property, range) so the assistant can default to them.
 */
export const GOOGLE_ANALYTICS_PAGE_CONTEXT_RUNTIME_KEY =
  "googleAnalyticsPageContext";

export type GoogleAnalyticsPageContext = {
  /** Brand id, already checked against the published scope (else null). */
  brandId: number | null;
  /** Property row id, already checked against the scope (else null). */
  propertyRowId: string | null;
  /** "7d" | "28d" | "90d", or null when the page did not say. */
  range: string | null;
};

/**
 * RequestContext key carrying the filters of the sales page the user is
 * looking at (/sales/offers, /sales/consolidated-sales-report,
 * /sales/delivery), so the page assistants can default to them. Hint only.
 */
export const SALES_PAGE_CONTEXT_RUNTIME_KEY = "salesPageContext";

/** Agents that receive {@link SalesPageContext} as their page context. */
export const SALES_PAGE_AGENT_IDS = [
  "sales-offers-agent",
  "consolidated-sales-agent",
  "sales-delivery-agent",
] as const;

export type SalesPageContext = {
  /** Brand aliases from the page, already checked against the scope. */
  brands: string[];
  /** ISO `YYYY-MM-DD`, or null when the page did not say. */
  from: string | null;
  to: string | null;
  /** Other page filters (channels, locations, cities, tab…), sanitised. */
  filters: Record<string, string[]>;
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
  // pageContext: /sales/explore sends the orders selected in the grid.
  "sales-agent": {
    permissions: { sales: ["view"] },
    brandScoped: true,
    pageContext: true,
  },
  // Forecasts Assistant on /forecasts: same permission as the page, brand
  // scoped like the sales agent, and it receives the page's filters as hints.
  "forecasts-agent": {
    permissions: { forecasts: ["view"] },
    brandScoped: true,
    pageContext: true,
  },
  // Google Analytics Assistant on /google-analytics: same permission as the
  // page, scoped to the caller's own GA4 properties (not `brandScoped`), and
  // it receives the page's brand / property / range as hints.
  "google-analytics-agent": {
    permissions: { googleAnalytics: ["view"] },
    googleAnalyticsScoped: true,
    pageContext: true,
  },
  // Management Accounts Assistant on /management-accounts: same role gate as
  // the page, limited to the companies operating the caller's brands.
  "management-accounts-agent": {
    roles: managementAccountsRoles,
    managementAccountsScoped: true,
  },
  // Sales page assistants: same permission and brand scope as their pages
  // (/sales/offers, /sales/consolidated-sales-report, /sales/delivery); the
  // widget sends the page filters as a SalesPageContext hint.
  "sales-offers-agent": {
    permissions: { sales: ["view"] },
    brandScoped: true,
    pageContext: true,
  },
  "consolidated-sales-agent": {
    permissions: { sales: ["view"] },
    brandScoped: true,
    pageContext: true,
  },
  "sales-delivery-agent": {
    permissions: { sales: ["view"] },
    brandScoped: true,
    pageContext: true,
  },
};
