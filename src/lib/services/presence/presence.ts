import { z } from "zod";

/**
 * Live presence: which signed-in users have the app open, and which page each
 * of their tabs is on. Browser-safe — shared by the heartbeat endpoint, the
 * superUser monitoring stream, and the client reporter.
 */

/** One open browser tab, as tracked by the server-side presence registry. */
export interface PresenceTab {
  tabId: string;
  userId: string;
  name: string;
  email: string;
  role: string | null;
  path: string;
  title: string;
  /** `document.visibilityState === "visible"` at the last heartbeat. */
  visible: boolean;
  /** When the tab first reported in (ISO). */
  connectedAt: string;
  /** When the tab arrived on its current `path` (ISO). */
  pathSince: string;
  /** Last heartbeat received (ISO). */
  lastSeenAt: string;
}

/** Full registry state pushed to monitoring viewers on every change. */
export interface PresenceSnapshot {
  tabs: PresenceTab[];
  generatedAt: string;
}

/**
 * Heartbeat body posted by every tab. Identity (user, name, role) is never
 * taken from the client — the endpoint reads it from the session.
 */
export const presenceHeartbeatSchema = z.object({
  type: z.enum(["beat", "leave"]),
  tabId: z.uuid(),
  /** New per navigation; keys the persisted `page_view` row. */
  viewId: z.uuid(),
  /** SvelteKit route id (`page.route.id`); null when no route matched. */
  routeId: z.string().startsWith("/").max(256).nullable(),
  path: z.string().startsWith("/").max(512),
  title: z.string().max(200),
  visible: z.boolean(),
});

export type PresenceHeartbeat = z.infer<typeof presenceHeartbeatSchema>;

/** How often a tab re-announces itself while open. */
export const PRESENCE_HEARTBEAT_MS = 30_000;

/**
 * A tab with no heartbeat for this long is considered gone. Must stay well
 * above 60 s: Chrome throttles timers in hidden tabs to roughly once a minute,
 * so a tighter TTL would flicker background tabs offline.
 */
export const PRESENCE_TTL_MS = 90_000;
