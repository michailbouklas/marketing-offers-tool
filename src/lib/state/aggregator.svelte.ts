import { browser } from "$app/environment";
import {
  aggregators,
  type AggregatorValue,
} from "$lib/services/aggregator-kpis/aggregator-kpis";
import {
  AGGREGATOR_COOKIE,
  AGGREGATOR_COOKIE_MAX_AGE,
  DEFAULT_AGGREGATOR,
} from "$lib/services/aggregator-kpis/aggregator-cookie";

/**
 * App-global client store for the selected aggregator platform (Foody / Wolt).
 *
 * The period KPI pages are single-aggregator by nature, so the choice is kept in
 * a cookie and mirrored here as reactive state. Hydrated once from the root
 * layout's server data; the filter-bar toggle calls {@link AggregatorStore.set}
 * to persist a new choice, then navigates so the server load re-reads the cookie.
 * Mirrors the module-singleton pattern of `scrape-stream.svelte.ts`.
 */
class AggregatorStore {
  current = $state<AggregatorValue>(DEFAULT_AGGREGATOR);

  /** Seed from SSR data without writing a cookie (safe to call repeatedly). */
  hydrate(value: AggregatorValue | null | undefined): void {
    if (value && aggregators.includes(value)) {
      this.current = value;
    }
  }

  /** Persist a new choice to the cookie and update reactive state (browser only). */
  set(value: AggregatorValue): void {
    this.current = value;

    if (browser) {
      document.cookie = `${AGGREGATOR_COOKIE}=${value}; path=/; max-age=${AGGREGATOR_COOKIE_MAX_AGE}; SameSite=Lax`;
    }
  }
}

export const aggregatorStore = new AggregatorStore();
