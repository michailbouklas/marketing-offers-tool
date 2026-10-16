import { error, json } from "@sveltejs/kit";
import { describeGoogleAnalyticsError } from "$lib/services/google-analytics/ga4-client.server";
import { parseGoogleAnalyticsFilters } from "$lib/services/google-analytics/google-analytics";
import { resolveGoogleAnalyticsScope } from "$lib/services/google-analytics/properties.server";
import { getGoogleAnalyticsRealtime } from "$lib/services/google-analytics/realtime.server";
import type { RequestHandler } from "./$types";

const NO_STORE = { "cache-control": "no-store" };

/**
 * `GET /api/google-analytics/realtime?brand=<id>&property=<rowId>` — the
 * "Live now" snapshot, polled by the dashboard every 60 s. Scope is resolved
 * exactly like the page (user's own assignments; out-of-scope → 403) and a
 * Google failure answers 502 with a user-facing message.
 */
export const GET: RequestHandler = async (event) => {
  const filters = parseGoogleAnalyticsFilters(event.url.searchParams);
  const scope = await resolveGoogleAnalyticsScope(event, filters, {
    guard: "api",
  });

  if (!scope.property) {
    error(404, "No Google Analytics property in scope");
  }

  try {
    const realtime = await getGoogleAnalyticsRealtime(scope.property);

    return json(realtime, { headers: NO_STORE });
  } catch (err) {
    console.error(
      `[google-analytics] realtime failed for property row ${scope.property.id}:`,
      err instanceof Error ? err.message : err,
    );

    return json(
      { error: describeGoogleAnalyticsError(err) },
      { status: 502, headers: NO_STORE },
    );
  }
};
