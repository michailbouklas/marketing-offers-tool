import type { RequestContext } from "@mastra/core/request-context";
import {
  SALES_PAGE_CONTEXT_RUNTIME_KEY,
  type SalesPageContext,
} from "../chat-registry";

/**
 * "Page context" instructions for the sales page assistants: the filters the
 * user is looking at, already sanitised and brand-checked by the chat
 * endpoint (resolveSalesPageContext). Defaults only, never authorisation.
 */
export function buildSalesPageContextSection(
  requestContext: RequestContext | undefined,
  pageLabel: string,
): string {
  const context = requestContext?.get(SALES_PAGE_CONTEXT_RUNTIME_KEY) as
    | SalesPageContext
    | undefined;
  if (!context) return "";

  const facts: string[] = [];
  if (context.brands.length > 0)
    facts.push(`brands: ${context.brands.join(", ")}`);
  if (context.from || context.to)
    facts.push(
      `date range: ${context.from ?? "page default"} to ${context.to ?? "page default"}`,
    );
  for (const [key, values] of Object.entries(context.filters))
    facts.push(`${key}: ${values.join(", ")}`);
  if (facts.length === 0) return "";

  return [
    "",
    "",
    "## Page context",
    "",
    `The user is looking at the ${pageLabel} page with these filters:`,
    ...facts.map((fact) => `- ${fact}`),
    "",
    "Use them as defaults when the question does not say otherwise, and state",
    "the filters you used. This is a hint only; access is still governed by",
    "the Brand scope section.",
  ].join("\n");
}
