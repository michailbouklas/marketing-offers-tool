import type { GapListPage } from "$lib/services/offers-data-quality";

/**
 * Per-process cache of `/offers-data-quality` result pages.
 *
 * The real "cache" is the `dq_gap_queue_snapshot` table (rebuilt nightly);
 * this layer only absorbs the repeated sort / filter / page round-trips
 * between snapshot changes. It is invalidated explicitly — by the nightly
 * rebuild, by manual rebuilds and by every gap status change — through a
 * version counter, and additionally bounded by a short TTL as a safety net
 * (e.g. when more than one app instance is running). Stored on `globalThis`
 * so Vite HMR does not create a second, stale copy.
 */

type CacheEntry = {
  version: number;
  cachedAt: number;
  page: GapListPage;
};

type GapQueueCacheState = {
  entries: Map<string, CacheEntry>;
  version: number;
};

const MAX_ENTRIES = 500;

const globalForGapQueueCache = globalThis as typeof globalThis & {
  gapQueueCache?: GapQueueCacheState;
};

function getState(): GapQueueCacheState {
  globalForGapQueueCache.gapQueueCache ??= { entries: new Map(), version: 0 };

  return globalForGapQueueCache.gapQueueCache;
}

export type GapQueueCacheKeyInput = {
  brandAliases: string[] | null;
  statuses: string[] | null;
  sortBy: string;
  sortDir: string;
  page: number;
  pageSize: number;
};

export function buildGapQueueCacheKey(input: GapQueueCacheKeyInput): string {
  return JSON.stringify({
    brandAliases: input.brandAliases ? [...input.brandAliases].sort() : null,
    statuses: input.statuses ? [...input.statuses].sort() : null,
    sortBy: input.sortBy,
    sortDir: input.sortDir,
    page: input.page,
    pageSize: input.pageSize,
  });
}

/** Drop every cached page. Call after anything that changes the snapshot. */
export function invalidateGapQueueCache(): void {
  const state = getState();

  state.version += 1;
  state.entries.clear();
}

export function getGapQueueCacheVersion(): number {
  return getState().version;
}

/**
 * Serve `key` from cache when fresh, otherwise run `load` and remember the
 * result. `ttlMs <= 0` disables caching entirely.
 */
export async function withGapQueueCache(
  key: string,
  ttlMs: number,
  load: () => Promise<GapListPage>,
): Promise<GapListPage> {
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
    return cached.page;
  }

  const versionAtLoad = state.version;
  const page = await load();

  // A status change or rebuild that landed while we were querying already
  // bumped the version; do not re-insert a page that may be stale.
  if (state.version === versionAtLoad) {
    if (state.entries.size >= MAX_ENTRIES) {
      state.entries.clear();
    }

    state.entries.set(key, { version: versionAtLoad, cachedAt: now, page });
  }

  return page;
}
