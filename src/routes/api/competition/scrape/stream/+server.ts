import { requireApiPermission } from "$lib/server/auth-guards";
import {
  getScrapeJobSnapshot,
  getScrapeReplay,
  subscribeToScrape,
  type ScrapeStreamEvent,
} from "$lib/services/competition/scrape-job.server";
import type { RequestHandler } from "./$types";

const HEARTBEAT_MS = 15_000;

const encoder = new TextEncoder();

function frame(eventName: string, data: unknown, id?: number): Uint8Array {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  const idLine = id === undefined ? "" : `id: ${id}\n`;
  return encoder.encode(`${idLine}event: ${eventName}\ndata: ${payload}\n\n`);
}

/**
 * SSE stream of the current scrape's log output. A viewer can connect at any
 * time: buffered lines are replayed first, then live events are forwarded until
 * the run finishes (or, if it has already finished, the terminal event is
 * replayed so a late-joining viewer still gets the completion signal).
 *
 * Each log line carries a monotonic `id`. A reconnecting `EventSource` sends its
 * `Last-Event-ID`, so only newer lines are replayed and the viewer never sees
 * duplicates across a transient reconnect.
 */
export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, { urlsToScrape: ["manage"] });

  const lastEventId = Number.parseInt(
    event.request.headers.get("last-event-id") ?? "",
    10,
  );
  const afterId = Number.isFinite(lastEventId) ? lastEventId : 0;

  const snapshot = getScrapeJobSnapshot();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe: (() => void) | null = null;
      let heartbeat: ReturnType<typeof setInterval> | null = null;

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

      const cleanup = () => {
        if (closed) {
          return;
        }
        closed = true;
        unsubscribe?.();
        if (heartbeat) {
          clearInterval(heartbeat);
        }
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      if (snapshot.status === "idle") {
        safeEnqueue(frame("idle", {}));
        cleanup();
        return;
      }

      // 1) Replay buffered history (only lines newer than Last-Event-ID).
      for (const { id, line } of getScrapeReplay(afterId)) {
        safeEnqueue(frame("log", line, id));
      }

      const emitTerminal = (status: typeof snapshot.status) => {
        if (status === "succeeded") {
          safeEnqueue(frame("done", snapshot.summary));
        } else if (status === "failed") {
          safeEnqueue(frame("failed", snapshot.error ?? "Scrape failed."));
        }
      };

      // 2) Already finished — replay the terminal event and close.
      if (snapshot.status !== "running") {
        emitTerminal(snapshot.status);
        cleanup();
        return;
      }

      // 3) Running — forward live events.
      unsubscribe = subscribeToScrape((live: ScrapeStreamEvent) => {
        if (live.type === "log") {
          safeEnqueue(frame("log", live.line, live.id));
        } else if (live.type === "done") {
          safeEnqueue(frame("done", live.summary));
          cleanup();
        } else {
          safeEnqueue(frame("failed", live.message));
          cleanup();
        }
      });

      // Guard against the run finishing between snapshot read and subscribe.
      const latest = getScrapeJobSnapshot();
      if (latest.status !== "running" && !closed) {
        if (latest.status === "succeeded") {
          safeEnqueue(frame("done", latest.summary));
        } else if (latest.status === "failed") {
          safeEnqueue(frame("failed", latest.error ?? "Scrape failed."));
        }
        cleanup();
        return;
      }

      heartbeat = setInterval(() => {
        safeEnqueue(encoder.encode(": ping\n\n"));
      }, HEARTBEAT_MS);
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
