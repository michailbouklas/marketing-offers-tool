import { browser } from "$app/environment";
import {
  PRESENCE_HEARTBEAT_MS,
  type PresenceHeartbeat,
} from "$lib/services/presence/presence";

/**
 * App-global client reporter for live monitoring. Every signed-in tab tells the
 * server which page it is on; superUsers watch the result on
 * `/admin/live-monitoring`.
 *
 * Uses short `fetch` heartbeats rather than a per-tab `EventSource`: browsers
 * cap HTTP/1.1 connections at ~6 per origin across all tabs, so one long-lived
 * stream per tab would stall a user's 6th tab.
 *
 * The tab id lives in memory (not sessionStorage) on purpose — "Duplicate tab"
 * copies sessionStorage, which would make two tabs share one id.
 *
 * Each beat also carries a `viewId` that keys the persisted `page_view` row. A
 * new one is minted when the pathname changes (query-only changes such as
 * filter tweaks stay the same view, so they do not inflate visit counts) and
 * when a tab is restored from bfcache.
 */

const ENDPOINT = "/api/presence";
/** Coalesce init + the first `afterNavigate` (and rapid redirects) into one beat. */
const BEAT_DEBOUNCE_MS = 150;

class PresenceReporter {
  #tabId: string | null = null;
  #viewId: string | null = null;
  #viewPathname: string | null = null;
  #routeId: string | null = null;
  #interval: ReturnType<typeof setInterval> | null = null;
  #pending: ReturnType<typeof setTimeout> | null = null;

  /** Start reporting (idempotent, browser-only). */
  init(): void {
    if (!browser || this.#tabId) {
      return;
    }

    this.#tabId = crypto.randomUUID();

    document.addEventListener("visibilitychange", this.#onVisibilityChange);
    window.addEventListener("pagehide", this.#onPageHide);
    window.addEventListener("pageshow", this.#onPageShow);
    this.#interval = setInterval(
      () => this.#send("beat"),
      PRESENCE_HEARTBEAT_MS,
    );

    this.beat();
  }

  /**
   * Report the current page now (debounced). Call after navigation with the
   * SvelteKit route id (`page.route.id`).
   */
  beat(routeId?: string | null): void {
    if (routeId !== undefined) {
      this.#routeId = routeId;
    }
    if (!this.#tabId) {
      return;
    }
    if (this.#pending) {
      clearTimeout(this.#pending);
    }
    this.#pending = setTimeout(() => {
      this.#pending = null;
      this.#send("beat");
    }, BEAT_DEBOUNCE_MS);
  }

  /** Stop reporting and tell the server this tab is gone. */
  destroy(): void {
    if (!this.#tabId) {
      return;
    }
    this.#send("leave");
    this.#teardown();
  }

  #teardown(): void {
    document.removeEventListener("visibilitychange", this.#onVisibilityChange);
    window.removeEventListener("pagehide", this.#onPageHide);
    window.removeEventListener("pageshow", this.#onPageShow);
    if (this.#interval) {
      clearInterval(this.#interval);
    }
    if (this.#pending) {
      clearTimeout(this.#pending);
    }
    this.#interval = null;
    this.#pending = null;
    this.#tabId = null;
    this.#viewId = null;
    this.#viewPathname = null;
  }

  #onVisibilityChange = () => this.#send("beat");

  // Fires on close, reload, and bfcache entry. `pageshow` re-announces a tab
  // restored from bfcache, since the server already dropped it.
  #onPageHide = () => this.#send("leave");

  #onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) {
      // A restored tab is a fresh view, not a continuation hours later.
      this.#viewId = null;
      this.#send("beat");
    }
  };

  #payload(type: PresenceHeartbeat["type"]): PresenceHeartbeat | null {
    if (!this.#tabId) {
      return null;
    }
    if (!this.#viewId || this.#viewPathname !== location.pathname) {
      this.#viewId = crypto.randomUUID();
      this.#viewPathname = location.pathname;
    }
    return {
      type,
      tabId: this.#tabId,
      viewId: this.#viewId,
      routeId: this.#routeId,
      path: `${location.pathname}${location.search}`.slice(0, 512),
      title: document.title.slice(0, 200),
      visible: document.visibilityState === "visible",
    };
  }

  #send(type: PresenceHeartbeat["type"]): void {
    const payload = this.#payload(type);
    if (!payload) {
      return;
    }
    const body = JSON.stringify(payload);

    // `sendBeacon` is the only request reliably delivered while the page unloads.
    if (type === "leave") {
      navigator.sendBeacon(
        ENDPOINT,
        new Blob([body], { type: "application/json" }),
      );
      return;
    }

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    })
      .then((response) => {
        // Signed out or session expired: stop quietly instead of retrying.
        if (response.status === 401 || response.status === 403) {
          this.#teardown();
        }
      })
      .catch(() => {
        // Best-effort: a dropped beat is covered by the next one.
      });
  }
}

export const presenceReporter = new PresenceReporter();
