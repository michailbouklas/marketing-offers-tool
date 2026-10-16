import type {
  GoogleAnalyticsDashboard,
  GoogleAnalyticsRealtime,
} from "$lib/services/google-analytics/google-analytics";

/**
 * Per-process caches for `/google-analytics`:
 *
 * - dashboards keyed by property row + date range (TTL
 *   `GOOGLE_ANALYTICS_CACHE_TTL_MS`, default 10 min) — GA4 standard
 *   properties have a daily Data API token quota;
 * - realtime snapshots keyed by property row (30 s) — many open tabs polling
 *   every minute collapse into one Google call per half minute.
 *
 * Both are invalidated together (version counter) whenever an admin edits a
 * property, and bounded by their TTL as a safety net. Stored on `globalThis`
 * so Vite HMR does not create a second, stale copy. Same shape as
 * `gap-queue-cache`.
 */

type CacheEntry<T> = {
  version: number;
  cachedAt: number;
  value: T;
};

type CacheState = {
  dashboards: Map<string, CacheEntry<GoogleAnalyticsDashboard>>;
  realtime: Map<string, CacheEntry<GoogleAnalyticsRealtime>>;
  version: number;
};

const MAX_ENTRIES = 200;

// Versioned key: the state shape changed once already and a stale object from
// before an HMR reload must not be reused.
const globalForCache = globalThis as typeof globalThis & {
  googleAnalyticsCacheV2?: CacheState;
};

function getState(): CacheState {
  globalForCache.googleAnalyticsCacheV2 ??= {
    dashboards: new Map(),
    realtime: new Map(),
    version: 0,
  };

  return globalForCache.googleAnalyticsCacheV2;
}

export function buildGoogleAnalyticsCacheKey(input: {
  propertyRowId: string;
  range: string;
}): string {
  return `${input.propertyRowId}:${input.range}`;
}

/** Drop every cached dashboard and realtime snapshot. */
export function invalidateGoogleAnalyticsCache(): void {
  const state = getState();

  state.version += 1;
  state.dashboards.clear();
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

export function withGoogleAnalyticsCache(
  key: string,
  ttlMs: number,
  load: () => Promise<GoogleAnalyticsDashboard>,
): Promise<GoogleAnalyticsDashboard> {
  return withBucket(getState().dashboards, key, ttlMs, load);
}

export function withGoogleAnalyticsRealtimeCache(
  key: string,
  ttlMs: number,
  load: () => Promise<GoogleAnalyticsRealtime>,
): Promise<GoogleAnalyticsRealtime> {
  return withBucket(getState().realtime, key, ttlMs, load);
}
