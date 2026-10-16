import type { GoogleAnalyticsDashboard } from "$lib/services/google-analytics/google-analytics";

/**
 * Per-process cache of `/google-analytics` dashboards keyed by property row
 * and date range. GA4 standard properties have a daily Data API token quota,
 * so repeated loads of the same view within the TTL are served from memory.
 * Invalidated explicitly (version counter) whenever an admin edits a property
 * and bounded by the TTL as a safety net. Stored on `globalThis` so Vite HMR
 * does not create a second, stale copy. Same shape as `gap-queue-cache`.
 */

type CacheEntry = {
  version: number;
  cachedAt: number;
  dashboard: GoogleAnalyticsDashboard;
};

type CacheState = {
  entries: Map<string, CacheEntry>;
  version: number;
};

const MAX_ENTRIES = 200;

const globalForCache = globalThis as typeof globalThis & {
  googleAnalyticsCache?: CacheState;
};

function getState(): CacheState {
  globalForCache.googleAnalyticsCache ??= { entries: new Map(), version: 0 };

  return globalForCache.googleAnalyticsCache;
}

export function buildGoogleAnalyticsCacheKey(input: {
  propertyRowId: string;
  range: string;
}): string {
  return `${input.propertyRowId}:${input.range}`;
}

/** Drop every cached dashboard. Call after any property create/update/delete. */
export function invalidateGoogleAnalyticsCache(): void {
  const state = getState();

  state.version += 1;
  state.entries.clear();
}

export async function withGoogleAnalyticsCache(
  key: string,
  ttlMs: number,
  load: () => Promise<GoogleAnalyticsDashboard>,
): Promise<GoogleAnalyticsDashboard> {
  if (ttlMs <= 0) {
    return load();
  }

  const state = getState();
  const now = Date.now();
  const cached = state.entries.get(key);

  if (
    cached &&
    cached.version === state.version &&
    now - cached.cachedAt < ttlMs
  ) {
    return cached.dashboard;
  }

  const versionAtLoad = state.version;
  const dashboard = await load();

  if (state.version === versionAtLoad) {
    if (state.entries.size >= MAX_ENTRIES) {
      state.entries.clear();
    }

    state.entries.set(key, {
      version: versionAtLoad,
      cachedAt: now,
      dashboard,
    });
  }

  return dashboard;
}
