import { toast } from "svelte-sonner";
import { browser } from "$app/environment";
import { invalidate } from "$app/navigation";
import {
  RELEASE_EVENT_CHANNEL,
  RELEASE_EVENT_LOCK,
  RELEASE_STREAM_URL,
  RELEASES_DEPENDENCY,
  releasePublishedEventSchema,
  type ReleasePublishedEvent,
} from "$lib/services/releases/releases";

/**
 * App-global client store for live "release published" notifications.
 *
 * One EventSource per browser, not per tab: browsers cap HTTP/1.1 at ~6
 * connections per origin across all tabs (see presence-reporter.ts), so every
 * tab queues for a Web Lock and only the holder opens `/api/releases/stream`.
 * The holder's lock callback stays pending for the life of the tab; when that
 * tab closes the browser grants the lock to the next queued tab, which opens
 * its own stream. Events are relayed to the other tabs over a
 * BroadcastChannel (`postMessage` is not delivered to the posting tab, so the
 * leader also handles each event locally).
 *
 * Without Web Locks (very old browsers) each tab falls back to its own stream.
 */

const TOAST_ID = "release-published";
/** After a terminal stream error (401 on session expiry) wait before competing for the lock again. */
const RELEASE_RETRY_MS = 30_000;

type LatestFrame = { latestReleaseId: number | null };

class ReleaseEventsStore {
  /** Ids announced live since this page loaded; lights the header dot before the layout re-fetches. */
  liveReleaseIds = $state<number[]>([]);

  #userId: string | null = null;
  #active = false;
  #channel: BroadcastChannel | null = null;
  #source: EventSource | null = null;
  #releaseLock: (() => void) | null = null;
  #retry: ReturnType<typeof setTimeout> | null = null;
  #knownLatestId: number | null | undefined = undefined;

  /** Browser-only, idempotent. Call again after `destroy()` for a new session. */
  init(userId: string): void {
    if (!browser || this.#active) {
      return;
    }
    this.#active = true;
    this.#userId = userId;

    if ("BroadcastChannel" in window) {
      this.#channel = new BroadcastChannel(RELEASE_EVENT_CHANNEL);
      this.#channel.onmessage = (event: MessageEvent) =>
        this.#handle(event.data, "channel");
    }

    if (this.#channel && "locks" in navigator) {
      void this.#requestLeadership();
    } else {
      this.#connect();
    }
  }

  /** Sign-out: close everything and hand the lock to another tab. */
  destroy(): void {
    this.#active = false;
    this.#userId = null;
    this.#close();
    this.#giveUpLeadership();
    if (this.#retry) {
      clearTimeout(this.#retry);
      this.#retry = null;
    }
    this.#channel?.close();
    this.#channel = null;
    this.liveReleaseIds = [];
    this.#knownLatestId = undefined;
  }

  async #requestLeadership(): Promise<void> {
    if (!this.#active) {
      return;
    }
    await navigator.locks.request(
      RELEASE_EVENT_LOCK,
      { mode: "exclusive" },
      () =>
        new Promise<void>((release) => {
          if (!this.#active) {
            release();
            return;
          }
          this.#releaseLock = release;
          this.#connect();
        }),
    );
  }

  #giveUpLeadership(): void {
    this.#releaseLock?.();
    this.#releaseLock = null;
  }

  #connect(): void {
    if (this.#source) {
      return;
    }
    const source = new EventSource(RELEASE_STREAM_URL);
    this.#source = source;

    source.addEventListener("latest", (event) => {
      let frame: LatestFrame;
      try {
        frame = JSON.parse((event as MessageEvent).data) as LatestFrame;
      } catch {
        return;
      }
      const latest = frame.latestReleaseId;
      // A reconnect after a transient drop: a newer id means we missed the
      // `published` frame while offline, so announce it from the id alone.
      if (
        this.#knownLatestId !== undefined &&
        latest !== null &&
        (this.#knownLatestId === null || latest > this.#knownLatestId)
      ) {
        this.#noticeRelease(latest, true);
      }
      this.#knownLatestId = latest;
    });

    source.addEventListener("published", (event) => {
      try {
        this.#handle(JSON.parse((event as MessageEvent).data), "stream");
      } catch {
        // Malformed frame; ignore.
      }
    });

    source.onerror = () => {
      // Transient drops auto-reconnect (readyState CONNECTING). A non-200
      // response — 401 once the session expired — closes the source for good:
      // release the lock so another tab can lead, and try again later.
      if (source.readyState !== EventSource.CLOSED) {
        return;
      }
      this.#close();
      this.#giveUpLeadership();
      if (this.#active && !this.#retry) {
        this.#retry = setTimeout(() => {
          this.#retry = null;
          if (!this.#active) {
            return;
          }
          if (this.#channel && "locks" in navigator) {
            void this.#requestLeadership();
          } else {
            this.#connect();
          }
        }, RELEASE_RETRY_MS);
      }
    };
  }

  #handle(raw: unknown, origin: "stream" | "channel"): void {
    const parsed = releasePublishedEventSchema.safeParse(raw);
    if (!parsed.success) {
      return;
    }
    const event: ReleasePublishedEvent = parsed.data;
    if (origin === "stream") {
      this.#knownLatestId = Math.max(
        this.#knownLatestId ?? 0,
        event.release.id,
      );
      this.#channel?.postMessage(event);
    }
    this.#noticeRelease(
      event.release.id,
      event.publishedByUserId !== this.#userId,
    );
  }

  #noticeRelease(releaseId: number, announce: boolean): void {
    if (this.liveReleaseIds.includes(releaseId)) {
      return;
    }
    // Refresh the header list / unread count without a page reload. The
    // author's own tabs only refresh — they already know.
    void invalidate(RELEASES_DEPENDENCY);
    if (!announce) {
      return;
    }
    this.liveReleaseIds = [...this.liveReleaseIds, releaseId];
    toast.info(
      "There's new features available, click here to refresh the page",
      {
        id: TOAST_ID,
        duration: Infinity,
        closeButton: true,
        action: {
          label: "Refresh",
          onClick: () => location.reload(),
        },
      },
    );
  }

  #close(): void {
    this.#source?.close();
    this.#source = null;
  }
}

export const releaseEvents = new ReleaseEventsStore();
