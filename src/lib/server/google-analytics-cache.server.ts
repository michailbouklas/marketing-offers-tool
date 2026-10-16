import type { GoogleAnalyticsRealtime } from "$lib/services/google-analytics/google-analytics";

/**
 * Per-process cache of "Live now" realtime snapshots keyed by property row
 * (30 s): many open tabs polling every minute collapse into one Google call
 * per half minute. A snapshot is worthless a minute later, so this is the one
 * Google Analytics cache that stays in memory — dashboard reports live in
 * Postgres (`google_analytics_report_cache`, see
 * `src/lib/services/google-analytics/report-cache.server.ts`).
 *
 * Invalidated (version counter) whenever an admin edits a property or clears
 * the GA caches, and bounded by the TTL as a safety net. Stored on
 * `globalThis` so Vite HMR does not create a second, stale copy.
 */

type CacheEntry<T> = {
  version: number;
  cachedAt: number;
  value: T;
};

type CacheState = {
  realtime: Map<string, CacheEntry<GoogleAnalyticsRealtime>>;
  version: number;
};

const MAX_ENTRIES = 200;

// Versioned key: the state shape changed (dashboards moved to Postgres) and a
// stale object from before an HMR reload must not be reused.
const globalForCache = globalThis as typeof globalThis & {
  googleAnalyticsCacheV3?: CacheState;
};

function getState(): CacheState {
  globalForCache.googleAnalyticsCacheV3 ??= {
    realtime: new Map(),
    version: 0,
  };

  return globalForCache.googleAnalyticsCacheV3;
}

/** Drop every cached realtime snapshot. */
export function invalidateGoogleAnalyticsCache(): void {
  const state = getState();

  state.version += 1;
  state.realtime.clear();
}

async function withBucket<T>(
  bucket: Map<string, CacheEntry<T>>,
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  if (ttlMs <= 0) {
    return load();
  }

  const state = getState();
  const now = Date.now();
  const cached = bucket.get(key);

  if (
    cached &&
    cached.version === state.version &&
    now - cached.cachedAt < ttlMs
  ) {
    return cached.value;
  }

  const versionAtLoad = state.version;
  const value = await load();

  // An admin edit that landed while we were querying already bumped the
  // version; do not re-insert a value that may be stale.
  if (state.version === versionAtLoad) {
    if (bucket.size >= MAX_ENTRIES) {
      bucket.clear();
    }

    bucket.set(key, { version: versionAtLoad, cachedAt: now, value });
  }

  return value;
}

export function withGoogleAnalyticsRealtimeCache(
  key: string,
  ttlMs: number,
  load: () => Promise<GoogleAnalyticsRealtime>,
): Promise<GoogleAnalyticsRealtime> {
  return withBucket(getState().realtime, key, ttlMs, load);
}
