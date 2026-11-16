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

/** One signed-in user and their open tabs. */
export interface PresenceUserGroup {
  userId: string;
  name: string;
  email: string;
  role: string | null;
  tabs: PresenceTab[];
  anyVisible: boolean;
}

/**
 * Tabs -> one group per user: foreground tab first, then most recently
 * navigated; users with a visible tab first, then by name.
 */
export function groupPresenceTabs(tabs: PresenceTab[]): PresenceUserGroup[] {
  const byUser = new Map<string, PresenceUserGroup>();
  for (const tab of tabs) {
    let group = byUser.get(tab.userId);
    if (!group) {
      group = {
        userId: tab.userId,
        name: tab.name,
        email: tab.email,
        role: tab.role,
        tabs: [],
        anyVisible: false,
      };
      byUser.set(tab.userId, group);
    }
    group.tabs.push(tab);
    group.anyVisible ||= tab.visible;
  }

  for (const group of byUser.values()) {
    group.tabs.sort(
      (a, b) =>
        Number(b.visible) - Number(a.visible) ||
        b.pathSince.localeCompare(a.pathSince),
    );
  }

  return [...byUser.values()].sort(
    (a, b) =>
      Number(b.anyVisible) - Number(a.anyVisible) ||
      a.name.localeCompare(b.name),
  );
}
