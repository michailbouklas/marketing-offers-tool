import {
  fetchForecast as defaultFetchForecast,
  fetchForecastHistory as defaultFetchForecastHistory,
  ForecastClientError,
  isAbortError,
} from "./forecast-client";
import type {
  ForecastHistoryResponse,
  ForecastHorizonDays,
  ForecastResult,
} from "./forecast-types";

/**
 * Browser-side orchestration of one forecast request per selected model.
 *
 * Every model runs in isolation: its own `AbortController`, its own status,
 * its own retry. `sync` is idempotent — the page calls it from a `$effect`
 * whenever the URL filters change and only the delta is fetched.
 */

export type ForecastRunState =
  | { status: "loading" }
  | { status: "ready"; result: ForecastResult }
  | {
      status: "error";
      code: string;
      message: string;
      httpStatus: number | null;
      retryable: boolean;
    };

export type ForecastHistoryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: ForecastHistoryResponse }
  | { status: "error"; code: string; message: string };

export type ForecastSyncInput = {
  brand: string | null;
  horizonDays: ForecastHorizonDays;
  modelIds: string[];
};

export type ForecastRunsDeps = {
  fetchForecast?: typeof defaultFetchForecast;
  fetchForecastHistory?: typeof defaultFetchForecastHistory;
  /** Days of actuals requested from `/api/forecasts/history`. */
  historyDays?: number;
  /** Ready results kept for instant switch-back (LRU). */
  cacheSize?: number;
};

const DEFAULT_HISTORY_DAYS = 90;
const DEFAULT_CACHE_SIZE = 20;

function toErrorState(
  error: unknown,
): Extract<ForecastRunState, { status: "error" }> {
  if (error instanceof ForecastClientError) {
    return {
      status: "error",
      code: error.code,
      message: error.message,
      httpStatus: error.status,
      retryable: error.retryable,
    };
  }
  return {
    status: "error",
    code: "INTERNAL",
    message: error instanceof Error ? error.message : "Something went wrong.",
    httpStatus: null,
    retryable: true,
  };
}

export class ForecastRuns {
  results = $state<Record<string, ForecastRunState>>({});
  history = $state<ForecastHistoryState>({ status: "idle" });

  readonly #fetchForecast: typeof defaultFetchForecast;
  readonly #fetchForecastHistory: typeof defaultFetchForecastHistory;
  readonly #historyDays: number;
  readonly #cacheSize: number;

  #brand: string | null = null;
  #horizonDays: ForecastHorizonDays | null = null;
  #historyBrand: string | null = null;

  readonly #controllers = new Map<string, AbortController>();
  #historyController: AbortController | null = null;
  /** LRU of ready results keyed by `brand|model|horizon`; Map order = recency. */
  readonly #cache = new Map<string, ForecastResult>();

  constructor(deps: ForecastRunsDeps = {}) {
    this.#fetchForecast = deps.fetchForecast ?? defaultFetchForecast;
    this.#fetchForecastHistory =
      deps.fetchForecastHistory ?? defaultFetchForecastHistory;
    this.#historyDays = deps.historyDays ?? DEFAULT_HISTORY_DAYS;
    this.#cacheSize = deps.cacheSize ?? DEFAULT_CACHE_SIZE;
  }

  /** Ready results in the order of `modelIds` (for agreement / compare views). */
  readyResults(modelIds: string[]): ForecastResult[] {
    const results: ForecastResult[] = [];
    for (const id of modelIds) {
      const state = this.results[id];
      if (state?.status === "ready") {
        results.push(state.result);
      }
    }
    return results;
  }

  get isBusy(): boolean {
    return Object.values(this.results).some(
      (state) => state.status === "loading",
    );
  }

  /** Days of usable history reported by the history endpoint, if loaded. */
  get historyDays(): number | null {
    return this.history.status === "ready"
      ? this.history.data.historyDays
      : null;
  }

  /**
   * Reconcile the running requests with the requested scope. Idempotent:
   * calling it twice with the same input starts nothing new.
   */
  sync(input: ForecastSyncInput): void {
    const { brand, horizonDays, modelIds } = input;

    if (brand === null) {
      this.cancelAll();
      this.#brand = null;
      this.#horizonDays = null;
      this.#historyBrand = null;
      this.history = { status: "idle" };
      return;
    }

    const scopeChanged =
      brand !== this.#brand || horizonDays !== this.#horizonDays;
    if (scopeChanged) {
      this.#abortAllModels();
      this.results = {};
      this.#brand = brand;
      this.#horizonDays = horizonDays;
    }

    if (brand !== this.#historyBrand) {
      this.#loadHistory(brand);
    }

    const wanted = new Set(modelIds);
    for (const id of Object.keys(this.results)) {
      if (!wanted.has(id)) {
        this.#abortModel(id);
        delete this.results[id];
      }
    }

    for (const id of modelIds) {
      if (this.results[id]) {
        continue;
      }
      const cached = this.#cache.get(this.#cacheKey(brand, id, horizonDays));
      if (cached) {
        this.#touchCache(brand, id, horizonDays, cached);
        this.results[id] = { status: "ready", result: cached };
        continue;
      }
      this.#run(brand, id, horizonDays);
    }
  }

  /** Re-run one model, bypassing the cache (also used by "Refresh"). */
  retry(modelId: string): void {
    if (this.#brand === null || this.#horizonDays === null) {
      return;
    }
    this.#abortModel(modelId);
    this.#cache.delete(this.#cacheKey(this.#brand, modelId, this.#horizonDays));
    this.#run(this.#brand, modelId, this.#horizonDays);
  }

  /** Abort every in-flight request (page teardown). Keeps the LRU cache. */
  cancelAll(): void {
    this.#abortAllModels();
    this.#historyController?.abort();
    this.#historyController = null;
    if (this.history.status === "loading") {
      this.history = { status: "idle" };
      this.#historyBrand = null;
    }
  }

  // -------------------------------------------------------------------------

  #cacheKey(brand: string, modelId: string, horizonDays: number): string {
    return `${brand}|${modelId}|${horizonDays}`;
  }

  #touchCache(
    brand: string,
    modelId: string,
    horizonDays: number,
    result: ForecastResult,
  ): void {
    const key = this.#cacheKey(brand, modelId, horizonDays);
    this.#cache.delete(key);
    this.#cache.set(key, result);
    while (this.#cache.size > this.#cacheSize) {
      const oldest = this.#cache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.#cache.delete(oldest);
    }
  }

  #abortModel(modelId: string): void {
    const controller = this.#controllers.get(modelId);
    if (controller) {
      controller.abort();
      this.#controllers.delete(modelId);
    }
  }

  #abortAllModels(): void {
    for (const controller of this.#controllers.values()) {
      controller.abort();
    }
    this.#controllers.clear();
  }

  #run(brand: string, modelId: string, horizonDays: ForecastHorizonDays): void {
    const controller = new AbortController();
    this.#controllers.set(modelId, controller);
    this.results[modelId] = { status: "loading" };

    void this.#fetchForecast(
      { brandAlias: brand, modelId, horizonDays },
      { signal: controller.signal },
    )
      .then((result) => {
        if (
          controller.signal.aborted ||
          this.#controllers.get(modelId) !== controller
        ) {
          return;
        }
        this.#controllers.delete(modelId);
        this.#touchCache(brand, modelId, horizonDays, result);
        this.results[modelId] = { status: "ready", result };
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) {
          return;
        }
        if (this.#controllers.get(modelId) !== controller) {
          return;
        }
        this.#controllers.delete(modelId);
        this.results[modelId] = toErrorState(error);
      });
  }

  #loadHistory(brand: string): void {
    this.#historyController?.abort();
    const controller = new AbortController();
    this.#historyController = controller;
    this.#historyBrand = brand;
    this.history = { status: "loading" };

    void this.#fetchForecastHistory(
      { brand, days: this.#historyDays },
      { signal: controller.signal },
    )
      .then((data) => {
        if (controller.signal.aborted) {
          return;
        }
        this.history = { status: "ready", data };
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) {
          return;
        }
        const state = toErrorState(error);
        this.history = {
          status: "error",
          code: state.code,
          message: state.message,
        };
      });
  }
}
