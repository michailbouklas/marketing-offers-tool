import type { RequestContext } from "@mastra/core/request-context";
import {
  BRAND_SCOPE_NAMES_RUNTIME_KEY,
  BRAND_SCOPE_RUNTIME_KEY,
} from "../chat-registry";

/**
 * Brand-scope instructions shared by the brand-scoped agents that query the
 * POS sales warehouse (sales-agent, forecasts-agent). The scope itself is
 * published by the chat endpoint into the RequestContext — never trusted
 * from the client — and the SQL/forecast tools enforce it as a hard guardrail;
 * this section only tells the model how to behave inside it.
 */

/** A brand as published by the chat endpoint: warehouse code + display name. */
export type ScopedBrand = { alias: string; name: string };

function resolveStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Aliases and names are index-aligned; a missing names array falls back to
 * the aliases.
 */
export function resolveScopedBrands(
  requestContext?: RequestContext,
): ScopedBrand[] {
  const aliases = resolveStringArray(
    requestContext?.get(BRAND_SCOPE_RUNTIME_KEY),
  );
  const names = resolveStringArray(
    requestContext?.get(BRAND_SCOPE_NAMES_RUNTIME_KEY),
  );

  return aliases.map((alias, index) => ({
    alias,
    name: names[index] ?? alias,
  }));
}

export function buildBrandScopeSection(
  brands: ScopedBrand[],
  options: {
    /** Extra bullets appended after the standard rules (already indented). */
    extraBullets?: string[];
  } = {},
): string {
  if (brands.length === 0) {
    return [
      "## Brand scope",
      "",
      "The current user has no assigned brands. Tell them there is no sales",
      "data available to them and do NOT run any query or call any tool.",
    ].join("\n");
  }

  const displayList = brands
    .map((brand) => `${brand.name} (\`${brand.alias}\`)`)
    .join(", ");
  const aliasIn = brands
    .map((brand) => `'${brand.alias.toLowerCase()}'`)
    .join(", ");

  return [
    "## Brand scope",
    "",
    `You are restricted to these brands ONLY: ${displayList}.`,
    "",
    `- EVERY query you run MUST filter to these brands — add`,
    `  \`lower(brand) IN (${aliasIn})\` (both tables carry \`brand\`). Never`,
    "  report, aggregate, or reveal data for any brand outside this list,",
    "  even if asked, and never run a query without this brand filter.",
    "- If the user asks about a brand that is NOT in this list, reply with",
    '  exactly: "You\'re not assigned to this brand" — and do NOT call any',
    "  tool or run any query for that request.",
    '- If the user asks which brands they have (e.g. "which are my brands"),',
    "  answer with the list above only — no database work is needed.",
    ...(options.extraBullets ?? []),
  ].join("\n");
}
