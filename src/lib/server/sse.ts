const encoder = new TextEncoder();
const HEARTBEAT_MS = 15_000;

/** Sends one SSE frame; `data.type` doubles as the event name. */
export type SseSend = (
  data: { type: string } & Record<string, unknown>,
) => void;

/**
 * Streams the frames `run` sends as `text/event-stream`, with a heartbeat.
 * A client disconnect only stops delivery: `run` keeps going to the end, so
 * work that writes data is never cut off half-way.
 */
export function sseResponse(run: (send: SseSend) => Promise<void>): Response {
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
        }
      };
      const send: SseSend = (data) =>
        enqueue(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
      const heartbeat = setInterval(() => enqueue(": ping\n\n"), HEARTBEAT_MS);

      void run(send)
        .catch((error) => {
          console.error("[sse] stream handler failed", error);
          send({ type: "error", message: "Unexpected server error" });
        })
        .finally(() => {
          clearInterval(heartbeat);
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            // Already closed by the client.
          }
        });
    },
    cancel() {
      closed = true;
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
}
