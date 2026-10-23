import { error } from "@sveltejs/kit";
import {
  getAuthenticatedUserRole,
  requireAuthenticatedApiUser,
} from "$lib/server/auth-guards";
import {
  recordPageViewBeat,
  recordPageViewLeave,
} from "$lib/services/page-views/page-view-recorder.server";
import { presenceHeartbeatSchema } from "$lib/services/presence/presence";
import {
  removeTab,
  upsertTab,
} from "$lib/services/presence/presence-registry.server";
import type { RequestHandler } from "./$types";

/**
 * Tab heartbeat for live monitoring. Every signed-in tab posts here on load,
 * on navigation, on visibility change, and periodically; `leave` arrives via
 * `navigator.sendBeacon` when the tab closes.
 *
 * Each beat updates the in-memory live registry and persists the page view for
 * the history pages. Persistence is best-effort: a database failure is logged
 * and never breaks the live view or the response.
 *
 * The body is read as text and parsed manually because `sendBeacon` cannot set
 * `content-type: application/json` without a Blob, and either shape is fine.
 */
export const POST: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);

  let body: unknown;
  try {
    body = JSON.parse(await event.request.text());
  } catch {
    error(400, "Invalid JSON");
  }

  const parsed = presenceHeartbeatSchema.safeParse(body);
  if (!parsed.success) {
    error(400, "Invalid heartbeat");
  }

  const heartbeat = parsed.data;

  if (heartbeat.type === "leave") {
    removeTab(user.id, heartbeat.tabId);
  } else {
    upsertTab(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: await getAuthenticatedUserRole(event),
      },
      heartbeat,
    );
  }

  try {
    if (heartbeat.type === "leave") {
      await recordPageViewLeave(user.id, heartbeat.viewId);
    } else {
      await recordPageViewBeat({
        userId: user.id,
        viewId: heartbeat.viewId,
        tabId: heartbeat.tabId,
        routeId: heartbeat.routeId,
        path: heartbeat.path,
        title: heartbeat.title,
        visible: heartbeat.visible,
      });
    }
  } catch (cause) {
    console.error("[page-views] failed to record heartbeat:", cause);
  }

  return new Response(null, { status: 204 });
};
