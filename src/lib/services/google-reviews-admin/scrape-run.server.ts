import { getGooglePlacesApiUrl } from "$lib/server/env";
import { GooglePlacesApiError } from "./places";
import { readApiError } from "./places.server";
import {
  ScrapeRunAlreadyRunningError,
  type ScrapeDoneStatus,
  type ScrapeLogStream,
  type ScrapeRunEvent,
  type ScrapeRunSnapshot,
  type ScrapeRunStreamFrame,
  type ScrapeRunsStatus,
  type ScrapeStage,
  type ScrapeStageStatus,
} from "./scrape-run";

/**
 * Server-side registry of on-demand place scrapes, modelled on
 * `competition/scrape-job.server.ts`.
 *
 * `startPlaceScrape` opens `POST /scrape-queries/{id}/scrape` on the scraper
 * API and keeps reading its SSE stream in the background, independent of any
 * browser. Every remote frame is normalised into a `ScrapeRunEvent` with a
 * monotonic `seq`, buffered (tail-capped) and fanned out to subscribers, so a
 * viewer can attach, detach and re-attach at any point. The remote run itself
 * is never aborted by us (the API ignores client disconnects anyway).
 *
 * Caveats shared with the competition job: state lives on `globalThis` for one
 * Node process and does not survive a restart; the scraper's own 409 lock is
 * the real cross-process guard.
 */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type Subscriber = (frame: ScrapeRunStreamFrame) => void;

/** Called once when a run reaches `succeeded` (e.g. to propagate the place's brand). */
export type ScrapeRunSucceededHook = (run: {
  placeId: number;
  query: string;
  brandId: number | null;
  runId: string | null;
}) => void;

interface RunState {
  placeId: number;
  query: string;
  brandId: number | null;
  onSucceeded: ScrapeRunSucceededHook | null;
  status: ScrapeRunSnapshot["status"];
  startedAt: string;
  startedByUserId: string;
  finishedAt: string | null;
  runId: string | null;
  stages: ScrapeStage[];
  events: ScrapeRunEvent[];
  eventCount: number;
  error: string | null;
  subscribers: Set<Subscriber>;
  abort: AbortController;
  idleTimedOut: boolean;
  /** Resolves when the run reaches a terminal state (used by tests). */
  completion: Promise<void>;
}

const MAX_BUFFERED_EVENTS = 2000;
const MAX_TRACKED_RUNS = 50;
const RUN_RETENTION_MS = 6 * 60 * 60 * 1000;
/** The remote pings every 15 s; anything quieter than this is a dead stream. */
const DEFAULT_IDLE_TIMEOUT_MS = 120_000;

const globalForRuns = globalThis as typeof globalThis & {
  googlePlacesScrapeRuns?: Map<number, RunState>;
};

function getRuns(): Map<number, RunState> {
  globalForRuns.googlePlacesScrapeRuns ??= new Map();
  return globalForRuns.googlePlacesScrapeRuns;
}

export function resetScrapeRunsForTesting(): void {
  for (const state of getRuns().values()) {
    state.abort.abort();
  }
  getRuns().clear();
}

function toSnapshot(state: RunState): ScrapeRunSnapshot {
  return {
    placeId: state.placeId,
    query: state.query,
    status: state.status,
    startedAt: state.startedAt,
    startedByUserId: state.startedByUserId,
    finishedAt: state.finishedAt,
    runId: state.runId,
    stages: state.stages.map((stage) => ({ ...stage })),
    events: state.events.slice(),
    eventCount: state.eventCount,
    error: state.error,
  };
}

export function getScrapeRunSnapshot(
  placeId: number,
): ScrapeRunSnapshot | null {
  const state = getRuns().get(placeId);
  return state ? toSnapshot(state) : null;
}

function findActive(): RunState | undefined {
  for (const state of getRuns().values()) {
    if (state.status === "running") {
      return state;
    }
  }
  return undefined;
}

export function getScrapeRunsStatus(): ScrapeRunsStatus {
  const active = findActive();
  const recent: Record<number, ScrapeRunSnapshot> = {};

  for (const state of getRuns().values()) {
    if (state.status !== "running") {
      recent[state.placeId] = toSnapshot(state);
    }
  }

  return { active: active ? toSnapshot(active) : null, recent };
}

/** Subscribe to live frames; no-op (returns a noop) unless the run is running. */
export function subscribeToScrapeRun(
  placeId: number,
  subscriber: Subscriber,
): () => void {
  const state = getRuns().get(placeId);
  if (!state || state.status !== "running") {
    return () => {};
  }

  state.subscribers.add(subscriber);
  return () => {
    state.subscribers.delete(subscriber);
  };
}

/** Buffered events with `seq > afterSeq`, oldest first. */
export function getScrapeRunReplay(
  placeId: number,
  afterSeq: number,
): ScrapeRunEvent[] {
  const state = getRuns().get(placeId);
  if (!state) {
    return [];
  }

  const firstSeq = state.eventCount - state.events.length + 1;
  const startIndex = Math.max(0, afterSeq - firstSeq + 1);
  return state.events.slice(startIndex);
}

/** Resolves once the run has finished (tests only; production fires and forgets). */
export function waitForScrapeRunForTesting(placeId: number): Promise<void> {
  const state = getRuns().get(placeId);
  return state ? state.completion : Promise.resolve();
}

function notify(state: RunState, frame: ScrapeRunStreamFrame) {
  for (const subscriber of state.subscribers) {
    try {
      subscriber(frame);
    } catch {
      // A broken subscriber must not take the run down.
    }
  }
}

/** `Omit` that distributes over a union instead of collapsing it to shared keys. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

function pushEvent(
  state: RunState,
  event: DistributiveOmit<ScrapeRunEvent, "seq">,
): ScrapeRunEvent {
  state.eventCount += 1;
  const full = { ...event, seq: state.eventCount } as ScrapeRunEvent;
  state.events.push(full);
  if (state.events.length > MAX_BUFFERED_EVENTS) {
    state.events.splice(0, state.events.length - MAX_BUFFERED_EVENTS);
  }
  notify(state, { kind: "event", event: full });
  return full;
}

function finish(
  state: RunState,
  outcome: { status: "succeeded" } | { status: "failed"; error: string },
) {
  if (state.status !== "running") {
    return;
  }

  state.finishedAt = new Date().toISOString();
  state.status = outcome.status;
  state.error = outcome.status === "failed" ? outcome.error : null;
  notify(state, {
    kind: "finished",
    status: outcome.status,
    error: state.error,
  });
  state.subscribers.clear();

  if (outcome.status === "succeeded" && state.onSucceeded) {
    try {
      state.onSucceeded({
        placeId: state.placeId,
        query: state.query,
        brandId: state.brandId,
        runId: state.runId,
      });
    } catch (error) {
      console.warn("[google-reviews/places] onSucceeded hook failed", error);
    }
  }
}

function evictStaleRuns(runs: Map<number, RunState>) {
  const now = Date.now();

  for (const [placeId, state] of runs) {
    if (
      state.status !== "running" &&
      state.finishedAt &&
      now - new Date(state.finishedAt).getTime() > RUN_RETENTION_MS
    ) {
      runs.delete(placeId);
    }
  }

  while (runs.size >= MAX_TRACKED_RUNS) {
    let oldest: RunState | undefined;
    for (const state of runs.values()) {
      if (state.status === "running") {
        continue;
      }
      if (!oldest || state.startedAt < oldest.startedAt) {
        oldest = state;
      }
    }
    if (!oldest) {
      break;
    }
    runs.delete(oldest.placeId);
  }
}

export type StartPlaceScrapeOptions = {
  placeId: number;
  query: string;
  /** Scraper brand of the place, handed to `onSucceeded`. */
  brandId?: number | null;
  userId: string;
  onSucceeded?: ScrapeRunSucceededHook;
  /** Overrides for tests. */
  baseUrl?: string;
  fetchFn?: FetchLike;
  idleTimeoutMs?: number;
};

/**
 * Starts a run and returns immediately with its snapshot; the stream is read
 * in the background. Throws `ScrapeRunAlreadyRunningError` when another run
 * is in progress and `GooglePlacesApiError` (503) when the API is unset.
 */
export function startPlaceScrape(
  options: StartPlaceScrapeOptions,
): ScrapeRunSnapshot {
  const runs = getRuns();

  const active = findActive();
  if (active) {
    throw new ScrapeRunAlreadyRunningError(active.placeId, active.query);
  }

  const baseUrl = options.baseUrl ?? getGooglePlacesApiUrl();
  if (!baseUrl) {
    throw new GooglePlacesApiError(
      503,
      "NOT_CONFIGURED",
      "GOOGLE_PLACES_API is not set. Point it at the Google Reviews scraper API root.",
    );
  }

  evictStaleRuns(runs);

  let resolveCompletion: () => void = () => {};
  const completion = new Promise<void>((resolve) => {
    resolveCompletion = resolve;
  });

  const state: RunState = {
    placeId: options.placeId,
    query: options.query,
    brandId: options.brandId ?? null,
    onSucceeded: options.onSucceeded ?? null,
    status: "running",
    startedAt: new Date().toISOString(),
    startedByUserId: options.userId,
    finishedAt: null,
    runId: null,
    stages: [],
    events: [],
    eventCount: 0,
    error: null,
    subscribers: new Set(),
    abort: new AbortController(),
    idleTimedOut: false,
    completion,
  };
  runs.set(state.placeId, state);

  void runPlaceScrape(state, {
    baseUrl,
    fetchFn: options.fetchFn ?? ((input, init) => fetch(input, init)),
    idleTimeoutMs: options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
  }).finally(resolveCompletion);

  return toSnapshot(state);
}

// ---------------------------------------------------------------------------
// Remote stream handling

export type SseFrame = { event: string; id: string | null; data: string };

/**
 * Incremental parser for `text/event-stream` bodies. Frames are separated by a
 * blank line; `event:`, `id:` and `data:` fields are honoured, comment lines
 * (`: ping`) are dropped, and multi-line `data:` is joined with `\n`.
 */
export class SseParser {
  #buffer = "";

  push(text: string): SseFrame[] {
    this.#buffer += text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const frames: SseFrame[] = [];

    for (;;) {
      const separator = this.#buffer.indexOf("\n\n");
      if (separator === -1) {
        break;
      }

      const raw = this.#buffer.slice(0, separator);
      this.#buffer = this.#buffer.slice(separator + 2);
      const frame = parseSseFrame(raw);
      if (frame) {
        frames.push(frame);
      }
    }

    return frames;
  }

  /** Parses whatever is left once the stream closes without a trailing blank line. */
  flush(): SseFrame[] {
    const raw = this.#buffer;
    this.#buffer = "";
    const frame = raw.trim().length > 0 ? parseSseFrame(raw) : null;
    return frame ? [frame] : [];
  }
}

function parseSseFrame(raw: string): SseFrame | null {
  let event = "message";
  let id: string | null = null;
  const dataLines: string[] = [];

  for (const line of raw.split("\n")) {
    if (line.length === 0 || line.startsWith(":")) {
      continue;
    }

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    if (field === "event") {
      event = value;
    } else if (field === "data") {
      dataLines.push(value);
    } else if (field === "id") {
      id = value;
    }
  }

  if (dataLines.length === 0 && event === "message") {
    return null;
  }

  return { event, id, data: dataLines.join("\n") };
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asCounts(value: unknown): Record<string, number> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const counts: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const n = asNumber(raw);
    if (n !== null) {
      counts[key] = n;
    }
  }
  return Object.keys(counts).length > 0 ? counts : null;
}

const stageStatuses: ScrapeStageStatus[] = [
  "started",
  "ok",
  "warn",
  "failed",
  "skipped",
];

function asStageStatus(value: unknown): ScrapeStageStatus {
  return stageStatuses.includes(value as ScrapeStageStatus)
    ? (value as ScrapeStageStatus)
    : "started";
}

function asDoneStatus(value: unknown): ScrapeDoneStatus {
  return value === "ok" || value === "warn" || value === "failed"
    ? value
    : "failed";
}

function parseData(frame: SseFrame): Record<string, unknown> {
  if (!frame.data) {
    return {};
  }

  try {
    const parsed = JSON.parse(frame.data) as unknown;
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { value: parsed };
  } catch {
    return { raw: frame.data };
  }
}

/** Applies one remote frame; returns true once the run is terminal. */
function handleRemoteFrame(state: RunState, frame: SseFrame): boolean {
  const data = parseData(frame);

  switch (frame.event) {
    case "start": {
      const stages = Array.isArray(data.stages)
        ? data.stages.filter((s): s is string => typeof s === "string")
        : [];
      pushEvent(state, {
        type: "start",
        query: asString(data.query) ?? state.query,
        stages,
        startedAt: asString(data.startedAt),
      });
      return false;
    }

    case "run": {
      state.runId = asString(data.runId);
      pushEvent(state, {
        type: "run",
        runId: state.runId,
        runDir: asString(data.runDir),
      });
      return false;
    }

    case "stage": {
      const stage: ScrapeStage = {
        stage: asString(data.stage) ?? "unknown",
        status: asStageStatus(data.status),
        durationMs: asNumber(data.durationMs),
        counts: asCounts(data.counts),
        error: asString(data.error),
      };
      const index = state.stages.findIndex((s) => s.stage === stage.stage);
      if (index === -1) {
        state.stages.push(stage);
      } else {
        state.stages[index] = stage;
      }
      pushEvent(state, { type: "stage", ...stage });
      return false;
    }

    case "log": {
      const stream: ScrapeLogStream =
        data.stream === "stderr" ? "stderr" : "stdout";
      pushEvent(state, {
        type: "log",
        stream,
        line: asString(data.line) ?? frame.data,
      });
      return false;
    }

    case "done": {
      const status = asDoneStatus(data.status);
      const exitCode = asNumber(data.exitCode);
      const error = asString(data.error);
      state.runId = asString(data.runId) ?? state.runId;
      pushEvent(state, {
        type: "done",
        status,
        exitCode,
        runId: state.runId,
        error,
      });
      if (status === "failed") {
        finish(state, {
          status: "failed",
          error:
            error ??
            `The pipeline failed${exitCode === null ? "" : ` (exit code ${exitCode})`}.`,
        });
      } else {
        finish(state, { status: "succeeded" });
      }
      return true;
    }

    case "error": {
      const message =
        asString(data.message) ??
        asString(data.error) ??
        (frame.data || "The scraper could not start the run.");
      pushEvent(state, { type: "error", message });
      finish(state, { status: "failed", error: message });
      return true;
    }

    default:
      // Unknown event names are ignored; the stream stays open.
      return false;
  }
}

async function runPlaceScrape(
  state: RunState,
  options: { baseUrl: string; fetchFn: FetchLike; idleTimeoutMs: number },
): Promise<void> {
  const { abort } = state;
  let watchdog: ReturnType<typeof setTimeout> | null = null;

  const armWatchdog = () => {
    if (watchdog) {
      clearTimeout(watchdog);
    }
    watchdog = setTimeout(() => {
      state.idleTimedOut = true;
      abort.abort();
    }, options.idleTimeoutMs);
  };

  try {
    const response = await options.fetchFn(
      `${options.baseUrl}/scrape-queries/${encodeURIComponent(state.placeId)}/scrape`,
      {
        method: "POST",
        headers: { accept: "text/event-stream" },
        signal: abort.signal,
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let message: string | undefined;
      try {
        message = readApiError(JSON.parse(text)).message;
      } catch {
        // Not JSON.
      }
      finish(state, {
        status: "failed",
        error:
          message ??
          `The Google Places API answered with HTTP ${response.status}.`,
      });
      return;
    }

    if (!response.body) {
      finish(state, {
        status: "failed",
        error: "The Google Places API returned an empty stream.",
      });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();

    // `fetch` rejects pending reads on abort, but race explicitly so the
    // watchdog also works for bodies that ignore the signal.
    const aborted = new Promise<never>((_, reject) => {
      const fail = () => reject(new Error("The stream was aborted."));
      if (abort.signal.aborted) {
        fail();
      } else {
        abort.signal.addEventListener("abort", fail, { once: true });
      }
    });
    aborted.catch(() => {});

    armWatchdog();

    for (;;) {
      const { value, done } = await Promise.race([reader.read(), aborted]);
      if (done) {
        break;
      }
      armWatchdog();

      for (const frame of parser.push(
        decoder.decode(value, { stream: true }),
      )) {
        if (handleRemoteFrame(state, frame)) {
          await reader.cancel().catch(() => {});
          return;
        }
      }
    }

    for (const frame of parser.push(decoder.decode())) {
      if (handleRemoteFrame(state, frame)) {
        return;
      }
    }
    for (const frame of parser.flush()) {
      if (handleRemoteFrame(state, frame)) {
        return;
      }
    }

    finish(state, {
      status: "failed",
      error: "The scraper stream ended before reporting a result.",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    finish(state, {
      status: "failed",
      error: state.idleTimedOut
        ? `No output from the scraper for ${Math.round(options.idleTimeoutMs / 1000)} s; gave up waiting. The run may still be going on the scraper host.`
        : `Lost the connection to the Google Places API (${detail}).`,
    });
  } finally {
    if (watchdog) {
      clearTimeout(watchdog);
    }
    if (!abort.signal.aborted) {
      // Nothing else needs the socket once the run is terminal.
      abort.abort();
    }
  }
}
