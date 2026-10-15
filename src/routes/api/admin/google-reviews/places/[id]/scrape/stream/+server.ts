import { error } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import type { ScrapeRunStreamFrame } from "$lib/services/google-reviews-admin/scrape-run";
import {
  getScrapeRunReplay,
  getScrapeRunSnapshot,
  subscribeToScrapeRun,
} from "$lib/services/google-reviews-admin/scrape-run.server";
import type { RequestHandler } from "./$types";

const HEARTBEAT_MS = 15_000;

const encoder = new TextEncoder();

function frame(eventName: string, data: unknown, id?: number): Uint8Array {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  const idLine = id === undefined ? "" : `id: ${id}\n`;
  return encoder.encode(`${idLine}event: ${eventName}\ndata: ${payload}\n\n`);
}

/**
 * SSE view of one place's scrape run, mirroring `api/competition/scrape/stream`.
 *
 * Frames: `event: run` carries a `ScrapeRunEvent` (JSON) with its `seq` as the
 * SSE id; `event: finished` carries `{ status, error }` and closes the stream;
 * `event: idle` means the server knows no run for this place. A reconnecting
 * `EventSource` sends `Last-Event-ID`, so only newer events are replayed.
 */
export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, { googleReviews: ["manage"] });

  const placeId = Number.parseInt(event.params.id, 10);
  if (!Number.isInteger(placeId) || placeId <= 0) {
    error(400, "Invalid place id.");
  }

  const lastEventId = Number.parseInt(
    event.request.headers.get("last-event-id") ?? "",
    10,
  );
  const afterSeq = Number.isFinite(lastEventId) ? lastEventId : 0;

  const snapshot = getScrapeRunSnapshot(placeId);

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

      const send = (live: ScrapeRunStreamFrame) => {
        if (live.kind === "event") {
          safeEnqueue(frame("run", live.event, live.event.seq));
          return;
        }
        safeEnqueue(
          frame("finished", { status: live.status, error: live.error }),
        );
        cleanup();
      };

      if (!snapshot) {
        safeEnqueue(frame("idle", {}));
        cleanup();
        return;
      }

      // 1) Replay buffered history newer than Last-Event-ID.
      for (const replayed of getScrapeRunReplay(placeId, afterSeq)) {
        safeEnqueue(frame("run", replayed, replayed.seq));
      }

      // 2) Already finished: send the terminal frame and close.
      if (snapshot.status !== "running") {
        send({
          kind: "finished",
          status: snapshot.status,
          error: snapshot.error,
        });
        return;
      }

      // 3) Running: forward live frames.
      unsubscribe = subscribeToScrapeRun(placeId, send);

      // Guard against the run finishing between snapshot read and subscribe.
      const latest = getScrapeRunSnapshot(placeId);
      if (latest && latest.status !== "running" && !closed) {
        for (const replayed of getScrapeRunReplay(
          placeId,
          snapshot.eventCount,
        )) {
          safeEnqueue(frame("run", replayed, replayed.seq));
        }
        send({ kind: "finished", status: latest.status, error: latest.error });
        return;
      }

      heartbeat = setInterval(() => {
        safeEnqueue(encoder.encode(": ping\n\n"));
      }, HEARTBEAT_MS);
    },
    cancel() {
      // Viewer went away; the run keeps going on the server.
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
