import { requireApiSuperUser } from "$lib/server/auth-guards";
import {
  getPresenceSnapshot,
  subscribeToPresence,
} from "$lib/services/presence/presence-registry.server";
import type { RequestHandler } from "./$types";

const HEARTBEAT_MS = 15_000;

const encoder = new TextEncoder();

function frame(eventName: string, data: unknown): Uint8Array {
  return encoder.encode(
    `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

/**
 * SSE stream of live presence for the superUser monitoring page. Sends the
 * full snapshot immediately, then again (debounced) on every registry change.
 * Snapshots are complete state, so a reconnecting `EventSource` needs no
 * replay — the first frame after reconnect is already current.
 */
export const GET: RequestHandler = async (event) => {
  await requireApiSuperUser(event);

  let cleanup: () => void = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(chunk);
        } catch {
          // Controller already closed by the client disconnecting.
        }
      };

      const unsubscribe = subscribeToPresence((snapshot) => {
        safeEnqueue(frame("snapshot", snapshot));
      });

      const heartbeat = setInterval(() => {
        safeEnqueue(encoder.encode(": ping\n\n"));
      }, HEARTBEAT_MS);

      cleanup = () => {
        if (closed) {
          return;
        }
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        event.request.signal.removeEventListener("abort", cleanup);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      event.request.signal.addEventListener("abort", cleanup);

      safeEnqueue(frame("snapshot", getPresenceSnapshot()));
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
};
