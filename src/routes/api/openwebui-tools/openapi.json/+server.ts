import { json } from "@sveltejs/kit";
import { preflight, withCors } from "$lib/server/cors";
import { getOpenWebUiEnv } from "$lib/server/env";
import type { RequestHandler } from "./$types";

/**
 * OpenAPI document for Open WebUI's "OpenAPI tool server" integration
 * (Settings → Integrations → Tools, or Admin Settings → External Tools).
 * Open WebUI turns every operation into an LLM-callable tool using its
 * `operationId`, `description` and request-body schema — so the description
 * below is written for the model, not for humans.
 *
 * Unauthenticated: nothing in the document is secret, and Open WebUI fetches
 * it from the browser (user-level registration) before the user can use it.
 */

const TOOL_DESCRIPTION = [
  "Ask the PHC Franchised Restaurants sales assistant a question about POS",
  "sales data: revenue, net/gross sales, transactions, items, offers, coupons,",
  "discounts, stores, channels (delivery/dine-in/online) and brand",
  "performance for brands such as Pizza Hut, KFC and Burger King. Use it",
  "whenever the user asks anything about sales figures or trends. Pass the",
  "question verbatim, including any dates, periods, brands, stores or",
  "comparisons they mentioned; for follow-ups also pass the relevant earlier",
  "turns in conversation_context. The answer is authoritative — computed",
  "from the data warehouse and already restricted to the brands the calling",
  "user is assigned to. Present its figures as-is; never recompute, estimate",
  "or invent numbers. Do not use this tool for anything unrelated to sales",
  "data.",
].join(" ");

function buildOpenApiDocument(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "PHC Sales Assistant",
      version: "1.0.0",
      description:
        "Natural-language access to PHC Franchised Restaurants POS sales data. " +
        "Answers are brand-scoped to the authenticated user.",
    },
    servers: [{ url: serverUrl }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
      schemas: {
        AskSalesRequest: {
          type: "object",
          required: ["question"],
          properties: {
            question: {
              type: "string",
              maxLength: 4000,
              description:
                "The user's sales question in natural language, including any " +
                "dates, periods, brands, stores, channels or items they mentioned.",
            },
            conversation_context: {
              type: "string",
              maxLength: 8000,
              description:
                "Optional. Earlier conversation turns needed to interpret a " +
                "follow-up (e.g. 'and for last year?').",
            },
          },
        },
        AskSalesResponse: {
          type: "object",
          required: ["answer", "brands_in_scope"],
          properties: {
            answer: {
              type: "string",
              description:
                "Markdown answer with the figures, supporting tables and the " +
                "exact date range that was queried.",
            },
            brands_in_scope: {
              type: "array",
              items: { type: "string" },
              description: "Display names of the brands the answer may cover.",
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                message: { type: "string" },
                type: { type: "string" },
                code: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
    paths: {
      "/ask-sales": {
        post: {
          operationId: "askSalesAssistant",
          summary:
            "Ask the PHC sales assistant a question about POS sales data",
          description: TOOL_DESCRIPTION,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AskSalesRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "The assistant's answer",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AskSalesResponse" },
                },
              },
            },
            "401": {
              description: "Missing or invalid bearer token",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "403": {
              description: "The user is not permitted to use the assistant",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "504": {
              description: "The question took too long to answer",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
    },
  };
}

export const OPTIONS: RequestHandler = (event) => preflight(event);

export const GET: RequestHandler = withCors(async (event) => {
  const base = getOpenWebUiEnv().PUBLIC_BASE_URL ?? event.url.origin;

  return json(buildOpenApiDocument(`${base}/api/openwebui-tools`), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
});
