import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { subscribeToReleaseEvents } from "$lib/services/releases/release-events.server";
import { getLatestReleaseId } from "$lib/services/releases/releases.server";
import type { RequestHandler } from "./$types";

const HEARTBEAT_MS = 15_000;

const encoder = new TextEncoder();

function frame(eventName: string, data: unknown): Uint8Array {
  return encoder.encode(
    `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

/**
 * SSE stream announcing newly published release notes to every signed-in
 * user. One tab per browser holds this connection (Web Lock in
 * `$lib/state/release-events.svelte.ts`) and relays frames to its siblings.
 *
 * The first frame is `latest` with the newest release id, so a leader that
 * reconnects after a drop can tell whether it missed a publish. The hooks
 * login redirect skips `/api`, hence the explicit 401 here — a non-200 makes
 * `EventSource` stop retrying.
 */
export const GET: RequestHandler = async (event) => {
  requireAuthenticatedApiUser(event);

  const latestReleaseId = await getLatestReleaseId();

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

      const unsubscribe = subscribeToReleaseEvents((published) => {
        safeEnqueue(frame("published", published));
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

      safeEnqueue(frame("latest", { latestReleaseId }));
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
      "x-accel-buffering": "no",
    },
  });
};
