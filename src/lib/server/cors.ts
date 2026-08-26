import type { RequestEvent, RequestHandler } from "@sveltejs/kit";
import { getOpenWebUiEnv } from "$lib/server/env";
import { externalErrorResponse } from "$lib/server/external-api-error";

/**
 * Route-local CORS for endpoints a browser on another origin calls directly —
 * today only the Open WebUI user-level tool server (`/api/openwebui-tools`).
 * Kept out of `hooks.server.ts` so the rest of the app stays same-origin.
 *
 * Allowed origins come from `OPENWEBUI_ORIGIN` (comma-separated; `*` echoes
 * any origin — dev only). Credentials are never allowed: these routes
 * authenticate with a bearer token, not cookies.
 */

const ALLOW_METHODS = "GET, POST, OPTIONS";
const ALLOW_HEADERS =
  "Authorization, Content-Type, X-OpenWebUI-User-Email, X-OpenWebUI-Chat-Id";

function allowedOrigin(event: RequestEvent): string | null {
  const origin = event.request.headers.get("origin")?.trim();

  if (!origin) {
    return null;
  }

  const allowed = getOpenWebUiEnv().OPENWEBUI_ORIGIN;
  const normalized = origin.replace(/\/+$/, "");

  return allowed.includes("*") || allowed.includes(normalized) ? origin : null;
}

/** CORS response headers for this request, or `{}` when it is not a permitted cross-origin call. */
export function corsHeaders(event: RequestEvent): Record<string, string> {
  const origin = allowedOrigin(event);

  if (!origin) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": ALLOW_METHODS,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

/** `OPTIONS` handler: 204 with the CORS headers, 403 for a disallowed origin. */
export function preflight(event: RequestEvent): Response {
  const headers = corsHeaders(event);

  if (event.request.headers.get("origin") && !("Vary" in headers)) {
    return new Response(null, { status: 403 });
  }

  return new Response(null, { status: 204, headers });
}

/**
 * Wraps a handler so both its response AND any thrown error carry the CORS
 * headers. SvelteKit's own error rendering does not add them, and a browser
 * turns a header-less 401 into an opaque network failure — the Open WebUI
 * user would never see the real message.
 */
export function withCors(handler: RequestHandler): RequestHandler {
  return async (event) => {
    const headers = corsHeaders(event);

    try {
      const response = await handler(event);

      for (const [name, value] of Object.entries(headers)) {
        response.headers.set(name, value);
      }

      return response;
    } catch (err) {
      return externalErrorResponse(err, headers);
    }
  };
}
