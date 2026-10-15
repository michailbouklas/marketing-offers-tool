import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/env", () => ({
  getGooglePlacesApiUrl: vi.fn(),
}));

const env = await import("$lib/server/env");
const { ScrapeRunAlreadyRunningError } = await import("./scrape-run");
const { GooglePlacesApiError } = await import("./places");
const {
  getScrapeRunReplay,
  getScrapeRunSnapshot,
  getScrapeRunsStatus,
  resetScrapeRunsForTesting,
  SseParser,
  startPlaceScrape,
  subscribeToScrapeRun,
  waitForScrapeRunForTesting,
} = await import("./scrape-run.server");

type Call = { url: string; init: RequestInit | undefined };

const encoder = new TextEncoder();

function sseResponse(chunks: string[], status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

function frame(event: string, id: number, data: unknown): string {
  return `event: ${event}\nid: ${id}\ndata: ${JSON.stringify(data)}\n\n`;
}

const happyStream = [
  frame("start", 1, {
    queryId: 7,
    query: "PAUL Nicosia",
    enabled: true,
    stages: ["scrape", "import"],
    startedAt: "2026-10-15T08:00:00.000Z",
  }),
  frame("run", 2, {
    runId: "run-1",
    runDir: "/runs/run-1",
    stages: ["scrape"],
  }),
  ": ping\n\n",
  frame("stage", 3, { stage: "scrape", status: "started" }),
  frame("log", 4, { stream: "stdout", line: "scraping…" }),
  frame("log", 5, { stream: "stderr", line: "warn: slow" }),
  frame("stage", 6, {
    stage: "scrape",
    status: "ok",
    durationMs: 1200,
    counts: { businesses: 3 },
  }),
  frame("stage", 7, { stage: "import", status: "ok", durationMs: 50 }),
  frame("done", 8, { status: "ok", exitCode: 0, runId: "run-1" }),
].join("");

function makeFetch(responder: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchFn = async (url: string, init?: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return responder(call);
  };
  return { fetchFn, calls };
}

const baseOptions = {
  placeId: 7,
  query: "PAUL Nicosia",
  userId: "user-1",
  baseUrl: "http://places.test",
};

beforeEach(() => {
  vi.clearAllMocks();
  resetScrapeRunsForTesting();
  vi.mocked(env.getGooglePlacesApiUrl).mockReturnValue("http://places.test");
});

describe("SseParser", () => {
  it("handles frames split across chunks, CRLF, comments and multi-line data", () => {
    const parser = new SseParser();
    const first = parser.push(
      "event: log\r\nid: 1\r\ndata: a\r\ndata: b\r\n\r\n: ping\r\n\r\nevent: st",
    );
    expect(first).toEqual([{ event: "log", id: "1", data: "a\nb" }]);

    const second = parser.push("age\ndata: {}\n\n");
    expect(second).toEqual([{ event: "stage", id: null, data: "{}" }]);

    expect(parser.push("data: tail")).toEqual([]);
    expect(parser.flush()).toEqual([
      { event: "message", id: null, data: "tail" },
    ]);
  });
});

describe("startPlaceScrape", () => {
  it("reads the remote SSE stream into ordered events and succeeds on done ok", async () => {
    // Split mid-frame to prove buffering across chunk boundaries.
    const cut = happyStream.indexOf('data: {"stream":"stderr"') + 10;
    const { fetchFn, calls } = makeFetch(() =>
      sseResponse([happyStream.slice(0, cut), happyStream.slice(cut)]),
    );

    const frames: unknown[] = [];
    const snapshot = startPlaceScrape({ ...baseOptions, fetchFn });
    subscribeToScrapeRun(7, (f) => frames.push(f));

    expect(snapshot.status).toBe("running");
    expect(calls[0].url).toBe("http://places.test/scrape-queries/7/scrape");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.headers).toMatchObject({
      accept: "text/event-stream",
    });

    await waitForScrapeRunForTesting(7);

    const final = getScrapeRunSnapshot(7);
    expect(final).toMatchObject({
      status: "succeeded",
      runId: "run-1",
      error: null,
      eventCount: 8,
    });
    expect(final?.finishedAt).toBeTruthy();
    expect(final?.events.map((e) => e.type)).toEqual([
      "start",
      "run",
      "stage",
      "log",
      "log",
      "stage",
      "stage",
      "done",
    ]);
    expect(final?.events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(final?.stages).toEqual([
      {
        stage: "scrape",
        status: "ok",
        durationMs: 1200,
        counts: { businesses: 3 },
        error: null,
      },
      {
        stage: "import",
        status: "ok",
        durationMs: 50,
        counts: null,
        error: null,
      },
    ]);
    expect(final?.events[4]).toMatchObject({
      type: "log",
      stream: "stderr",
      line: "warn: slow",
    });

    expect(frames.at(-1)).toEqual({
      kind: "finished",
      status: "succeeded",
      error: null,
    });
    expect(
      frames.filter((f) => (f as { kind: string }).kind === "event"),
    ).toHaveLength(8);
  });

  it("fails when done reports failed, keeping the API error", async () => {
    const { fetchFn } = makeFetch(() =>
      sseResponse([
        frame("start", 1, { query: "x", stages: [] }),
        frame("done", 2, {
          status: "failed",
          exitCode: 2,
          error: "scrape crashed",
        }),
      ]),
    );

    startPlaceScrape({ ...baseOptions, fetchFn });
    await waitForScrapeRunForTesting(7);

    expect(getScrapeRunSnapshot(7)).toMatchObject({
      status: "failed",
      error: "scrape crashed",
    });
  });

  it("fails with the API message on a 409 before the stream starts", async () => {
    const { fetchFn } = makeFetch(
      () =>
        new Response(
          JSON.stringify({
            error: true,
            message: "Pipeline already running (run abc)",
            errorCode: "PIPELINE_ALREADY_RUNNING",
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
    );

    startPlaceScrape({ ...baseOptions, fetchFn });
    await waitForScrapeRunForTesting(7);

    expect(getScrapeRunSnapshot(7)).toMatchObject({
      status: "failed",
      error: "Pipeline already running (run abc)",
    });
  });

  it("fails when the stream ends without a done event", async () => {
    const { fetchFn } = makeFetch(() =>
      sseResponse([frame("start", 1, { query: "x", stages: ["scrape"] })]),
    );

    startPlaceScrape({ ...baseOptions, fetchFn });
    await waitForScrapeRunForTesting(7);

    expect(getScrapeRunSnapshot(7)).toMatchObject({
      status: "failed",
      error: "The scraper stream ended before reporting a result.",
    });
  });

  it("gives up after the idle timeout", async () => {
    const { fetchFn } = makeFetch(
      () =>
        new Response(new ReadableStream<Uint8Array>({ start() {} }), {
          status: 200,
        }),
    );

    startPlaceScrape({ ...baseOptions, fetchFn, idleTimeoutMs: 20 });
    await waitForScrapeRunForTesting(7);

    expect(getScrapeRunSnapshot(7)?.status).toBe("failed");
    expect(getScrapeRunSnapshot(7)?.error).toMatch(
      /No output from the scraper/,
    );
  });

  it("refuses a second run while one is in progress and reports status", async () => {
    const { fetchFn } = makeFetch(
      () =>
        new Response(new ReadableStream<Uint8Array>({ start() {} }), {
          status: 200,
        }),
    );

    startPlaceScrape({ ...baseOptions, fetchFn, idleTimeoutMs: 10_000 });

    expect(() =>
      startPlaceScrape({ ...baseOptions, placeId: 8, query: "other", fetchFn }),
    ).toThrow(ScrapeRunAlreadyRunningError);

    const status = getScrapeRunsStatus();
    expect(status.active?.placeId).toBe(7);
    expect(status.recent).toEqual({});
  });

  it("replays only events newer than the given seq", async () => {
    const { fetchFn } = makeFetch(() => sseResponse([happyStream]));
    startPlaceScrape({ ...baseOptions, fetchFn });
    await waitForScrapeRunForTesting(7);

    expect(getScrapeRunReplay(7, 6).map((e) => e.seq)).toEqual([7, 8]);
    expect(getScrapeRunReplay(7, 0)).toHaveLength(8);
    expect(getScrapeRunReplay(99, 0)).toEqual([]);

    const status = getScrapeRunsStatus();
    expect(status.active).toBeNull();
    expect(status.recent[7]?.status).toBe("succeeded");
  });

  it("calls onSucceeded once with the place's brand, only on success", async () => {
    const okFetch = makeFetch(() => sseResponse([happyStream]));
    const onSucceeded = vi.fn();

    startPlaceScrape({
      ...baseOptions,
      brandId: 30,
      fetchFn: okFetch.fetchFn,
      onSucceeded,
    });
    await waitForScrapeRunForTesting(7);

    expect(onSucceeded).toHaveBeenCalledTimes(1);
    expect(onSucceeded).toHaveBeenCalledWith({
      placeId: 7,
      query: "PAUL Nicosia",
      brandId: 30,
      runId: "run-1",
    });

    resetScrapeRunsForTesting();
    const failFetch = makeFetch(() =>
      sseResponse([frame("done", 1, { status: "failed", exitCode: 1 })]),
    );
    const onFailedRun = vi.fn();
    startPlaceScrape({
      ...baseOptions,
      fetchFn: failFetch.fetchFn,
      onSucceeded: onFailedRun,
    });
    await waitForScrapeRunForTesting(7);

    expect(onFailedRun).not.toHaveBeenCalled();
  });

  it("throws NOT_CONFIGURED when GOOGLE_PLACES_API is unset", () => {
    vi.mocked(env.getGooglePlacesApiUrl).mockReturnValue(undefined);

    expect(() =>
      startPlaceScrape({ placeId: 7, query: "x", userId: "u" }),
    ).toThrow(GooglePlacesApiError);
  });
});
