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
const DEFAULT_ALLOW_HEADERS = [
  "authorization",
  "content-type",
  "x-openwebui-user-email",
  "x-openwebui-chat-id",
  "x-session-id",
];

/**
 * Allowed request headers = our defaults plus whatever the browser asked for
 * in the preflight. Open WebUI adds client headers over time (`X-Session-Id`
 * appeared in a recent release) and a fixed list turns each one into an
 * opaque "Failed to fetch". Echoing is safe: these routes never accept
 * cookies, so the header set carries no ambient credentials.
 */
function allowHeaders(event: RequestEvent): string {
  const merged = new Set(DEFAULT_ALLOW_HEADERS);
  const requested = event.request.headers.get("access-control-request-headers");

  for (const header of requested?.split(",") ?? []) {
    const name = header.trim().toLowerCase();

    if (name) {
      merged.add(name);
    }
  }

  return [...merged].join(", ");
}

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
    "Access-Control-Allow-Headers": allowHeaders(event),
    "Access-Control-Max-Age": "600",
    Vary: "Origin, Access-Control-Request-Headers",
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
