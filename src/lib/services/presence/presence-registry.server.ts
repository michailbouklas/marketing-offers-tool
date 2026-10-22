import {
  PRESENCE_TTL_MS,
  type PresenceSnapshot,
  type PresenceTab,
} from "$lib/services/presence/presence";

/**
 * In-memory registry of open tabs, fed by heartbeats from every signed-in
 * user's browser and read by the superUser live-monitoring SSE stream.
 *
 * Scope: like the competition scrape job, the singleton lives on `globalThis`
 * and assumes a single Node instance. It starts empty after a restart and
 * refills within one heartbeat interval, since every beat carries the tab's
 * full state. Tabs are keyed by `userId:tabId` with the user taken from the
 * session, so one user can never overwrite or evict another user's tab.
 */

/** Identity of the heartbeat sender, resolved server-side from the session. */
export interface PresenceUser {
  id: string;
  name: string;
  email: string;
  role: string | null;
}

export interface PresenceTabUpdate {
  tabId: string;
  path: string;
  title: string;
  visible: boolean;
}

type PresenceSubscriber = (snapshot: PresenceSnapshot) => void;

interface PresenceRegistryState {
  tabs: Map<string, PresenceTab>;
  subscribers: Set<PresenceSubscriber>;
  sweeper: ReturnType<typeof setInterval> | null;
  broadcastTimer: ReturnType<typeof setTimeout> | null;
}

const SWEEP_INTERVAL_MS = 15_000;
/** Coalesce bursts (e.g. several tabs navigating at once) into one push. */
const BROADCAST_DEBOUNCE_MS = 250;

const globalForPresence = globalThis as typeof globalThis & {
  presenceRegistry?: PresenceRegistryState;
};

function getState(): PresenceRegistryState {
  globalForPresence.presenceRegistry ??= {
    tabs: new Map(),
    subscribers: new Set(),
    sweeper: null,
    broadcastTimer: null,
  };
  return globalForPresence.presenceRegistry;
}

function tabKey(userId: string, tabId: string): string {
  return `${userId}:${tabId}`;
}

function ensureSweeper(state: PresenceRegistryState) {
  if (state.sweeper) {
    return;
  }
  state.sweeper = setInterval(() => sweepStaleTabs(), SWEEP_INTERVAL_MS);
  // Never keep the process alive just for presence bookkeeping.
  state.sweeper.unref?.();
}

function scheduleBroadcast(state: PresenceRegistryState) {
  if (state.broadcastTimer || state.subscribers.size === 0) {
    return;
  }
  state.broadcastTimer = setTimeout(() => {
    state.broadcastTimer = null;
    const snapshot = getPresenceSnapshot();
    for (const subscriber of state.subscribers) {
      try {
        subscriber(snapshot);
      } catch {
        // A failing viewer must never break other viewers or heartbeats.
      }
    }
  }, BROADCAST_DEBOUNCE_MS);
}

export function getPresenceSnapshot(): PresenceSnapshot {
  return {
    tabs: [...getState().tabs.values()],
    generatedAt: new Date().toISOString(),
  };
}

/** Insert or refresh a tab from a heartbeat. */
export function upsertTab(
  user: PresenceUser,
  update: PresenceTabUpdate,
  now: Date = new Date(),
): void {
  const state = getState();
  ensureSweeper(state);

  const key = tabKey(user.id, update.tabId);
  const existing = state.tabs.get(key);
  const nowIso = now.toISOString();

  state.tabs.set(key, {
    tabId: update.tabId,
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    path: update.path,
    title: update.title,
    visible: update.visible,
    connectedAt: existing?.connectedAt ?? nowIso,
    pathSince:
      existing && existing.path === update.path ? existing.pathSince : nowIso,
    lastSeenAt: nowIso,
  });

  scheduleBroadcast(state);
}

/** Drop a tab the user closed. Only the owning user can remove it. */
export function removeTab(userId: string, tabId: string): void {
  const state = getState();
  if (state.tabs.delete(tabKey(userId, tabId))) {
    scheduleBroadcast(state);
  }
}

/** Evict tabs that stopped heartbeating (crashed browser, lost network). */
export function sweepStaleTabs(now: number = Date.now()): void {
  const state = getState();
  let removed = false;
  for (const [key, tab] of state.tabs) {
    if (now - Date.parse(tab.lastSeenAt) > PRESENCE_TTL_MS) {
      state.tabs.delete(key);
      removed = true;
    }
  }
  if (removed) {
    scheduleBroadcast(state);
  }
}

/**
 * Subscribe to full snapshots, pushed (debounced) whenever the registry
 * changes. Returns an unsubscribe function.
 */
export function subscribeToPresence(callback: PresenceSubscriber): () => void {
  const state = getState();
  ensureSweeper(state);
  state.subscribers.add(callback);
  return () => {
    state.subscribers.delete(callback);
  };
}

/** Test-only: reset the singleton between cases. */
export function resetPresenceRegistry(): void {
  const state = globalForPresence.presenceRegistry;
  if (state) {
    if (state.sweeper) {
      clearInterval(state.sweeper);
    }
    if (state.broadcastTimer) {
      clearTimeout(state.broadcastTimer);
    }
  }
  globalForPresence.presenceRegistry = undefined;
}
