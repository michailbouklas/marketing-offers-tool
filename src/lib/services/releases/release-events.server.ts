import type { ReleasePublishedEvent } from "./releases";

/**
 * In-process pub/sub for "a release was published". The SSE endpoint
 * (`/api/releases/stream`) subscribes one callback per open connection; the
 * admin publish action calls `publishReleaseEvent` after the row is committed.
 *
 * Anchored on `globalThis` so Vite HMR does not create a second hub that the
 * open streams cannot see (same idiom as `scheduler.server.ts`).
 *
 * Single-instance assumption: subscribers live in this Node process only. If
 * the app is ever scaled to several replicas, publishes on one replica would
 * not reach streams held by another — swap the hub for Postgres
 * `LISTEN/NOTIFY` (the DB is already shared) before doing that.
 */

type ReleaseSubscriber = (event: ReleasePublishedEvent) => void;

const globalForReleaseEvents = globalThis as unknown as {
  releaseEventHub?: { subscribers: Set<ReleaseSubscriber> };
};

function hub() {
  return (globalForReleaseEvents.releaseEventHub ??= {
    subscribers: new Set(),
  });
}

/** Register a listener; returns the unsubscribe function. */
export function subscribeToReleaseEvents(
  subscriber: ReleaseSubscriber,
): () => void {
  hub().subscribers.add(subscriber);
  return () => {
    hub().subscribers.delete(subscriber);
  };
}

/** Fan a published release out to every open stream. A throwing subscriber never blocks the rest. */
export function publishReleaseEvent(event: ReleasePublishedEvent): void {
  for (const subscriber of hub().subscribers) {
    try {
      subscriber(event);
    } catch (error) {
      console.error("[releases] subscriber failed:", error);
    }
  }
}

export function getReleaseSubscriberCount(): number {
  return hub().subscribers.size;
}

/** Test hook: drop every subscriber. */
export function resetReleaseEventsForTesting(): void {
  hub().subscribers.clear();
}
