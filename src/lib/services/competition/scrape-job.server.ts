import { getRemoteScraperUrl } from "$lib/server/env";

/**
 * On-demand competition scrape orchestration.
 *
 * The SvelteKit Node server — not the browser — owns the connection to the
 * remote scraper. When a scrape starts we open the streaming request here, read
 * it to completion, and keep an in-memory singleton job (status + capped log
 * buffer + summary). Browser viewers subscribe via SSE and can disconnect /
 * reconnect (navigate away and back) without affecting the running scrape.
 *
 * Scope: the singleton lives on `globalThis` and assumes a single Node
 * instance. It does not survive a server restart. The remote scraper's own
 * single-flight lock (HTTP 409) is the real cross-instance guard.
 */

export type ScrapeStatus = "running" | "succeeded" | "failed";
export type ScrapeMode = "all" | "single";
export type ScrapeLanguage = "en" | "el";

/** Event pushed to subscribed SSE viewers as the scrape progresses. */
export type ScrapeStreamEvent =
  | { type: "log"; id: number; line: string }
  | { type: "done"; summary: string[] }
  | { type: "error"; message: string };

/** A buffered log line paired with its monotonic id (for SSE replay/resume). */
export interface ScrapeReplayLine {
  id: number;
  line: string;
}

/** Serializable snapshot of the current job (no subscribers / internals). */
export type ScrapeJobSnapshot =
  | { status: "idle" }
  | {
      status: ScrapeStatus;
      mode: ScrapeMode;
      startedAt: string;
      startedByUserId: string;
      target: { url: string; language: ScrapeLanguage } | null;
      lines: string[];
      summary: string[];
      error: string | null;
      finishedAt: string | null;
    };

interface ScrapeJobState {
  status: ScrapeStatus;
  mode: ScrapeMode;
  startedAt: string;
  startedByUserId: string;
  target: { url: string; language: ScrapeLanguage } | null;
  lines: string[];
  /** Total lines ever appended; the id of `lines[k]` is `lineCount - lines.length + k + 1`. */
  lineCount: number;
  summary: string[];
  error: string | null;
  finishedAt: string | null;
  subscribers: Set<(event: ScrapeStreamEvent) => void>;
}

/** Keep only the tail of the log so a long /scrape-all run can't grow unbounded. */
const MAX_BUFFERED_LINES = 2000;
/** Number of trailing lines captured as the run summary on success. */
const SUMMARY_LINE_COUNT = 8;

const globalForScrape = globalThis as typeof globalThis & {
  competitionScrapeJob?: ScrapeJobState | null;
};

export class ScrapeAlreadyRunningError extends Error {
  constructor(message = "A scrape is already running.") {
    super(message);
    this.name = "ScrapeAlreadyRunningError";
  }
}

export class ScrapeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScrapeConfigError";
  }
}

function getJob(): ScrapeJobState | null {
  return globalForScrape.competitionScrapeJob ?? null;
}

export function getScrapeJobSnapshot(): ScrapeJobSnapshot {
  const job = getJob();

  if (!job) {
    return { status: "idle" };
  }

  return {
    status: job.status,
    mode: job.mode,
    startedAt: job.startedAt,
    startedByUserId: job.startedByUserId,
    target: job.target,
    lines: job.lines.slice(),
    summary: job.summary.slice(),
    error: job.error,
    finishedAt: job.finishedAt,
  };
}

export function isScrapeRunning(): boolean {
  return getJob()?.status === "running";
}

function notify(job: ScrapeJobState, event: ScrapeStreamEvent): void {
  for (const subscriber of job.subscribers) {
    try {
      subscriber(event);
    } catch {
      // A failing subscriber must never break the scrape or other viewers.
    }
  }
}

function appendLine(job: ScrapeJobState, line: string): void {
  job.lineCount += 1;
  const id = job.lineCount;
  job.lines.push(line);
  if (job.lines.length > MAX_BUFFERED_LINES) {
    job.lines.splice(0, job.lines.length - MAX_BUFFERED_LINES);
  }
  notify(job, { type: "log", id, line });
}

/**
 * Buffered lines with id greater than `afterId`, for SSE replay/resume. A fresh
 * viewer passes `0` (full buffer); a reconnecting `EventSource` passes its
 * `Last-Event-ID` so only newer lines are replayed (no duplicates).
 */
export function getScrapeReplay(afterId: number): ScrapeReplayLine[] {
  const job = getJob();
  if (!job) {
    return [];
  }

  const firstId = job.lineCount - job.lines.length + 1;
  const startIndex = Math.max(0, afterId - firstId + 1);

  const replay: ScrapeReplayLine[] = [];
  for (let index = startIndex; index < job.lines.length; index += 1) {
    replay.push({ id: firstId + index, line: job.lines[index] });
  }
  return replay;
}

/**
 * Subscribe to live events for the current running job. Returns an unsubscribe
 * function. If there is no running job the callback is never invoked.
 */
export function subscribeToScrape(
  callback: (event: ScrapeStreamEvent) => void,
): () => void {
  const job = getJob();

  if (!job || job.status !== "running") {
    return () => {};
  }

  job.subscribers.add(callback);
  return () => {
    job.subscribers.delete(callback);
  };
}

export interface StartScrapeOptions {
  mode: ScrapeMode;
  userId: string;
  url?: string;
  language?: ScrapeLanguage;
}

/**
 * Begin a scrape. Throws {@link ScrapeAlreadyRunningError} if one is already
 * running, or {@link ScrapeConfigError} if the remote URL is not configured.
 * The remote request runs fire-and-forget; this returns as soon as the job is
 * registered so the HTTP handler can respond immediately.
 */
export function startScrape(options: StartScrapeOptions): ScrapeJobSnapshot {
  if (isScrapeRunning()) {
    throw new ScrapeAlreadyRunningError();
  }

  const baseUrl = getRemoteScraperUrl();
  if (!baseUrl) {
    throw new ScrapeConfigError(
      "REMOTE_SCRAPER_URL is not configured on the server.",
    );
  }

  const language: ScrapeLanguage = options.language ?? "en";
  const job: ScrapeJobState = {
    status: "running",
    mode: options.mode,
    startedAt: new Date().toISOString(),
    startedByUserId: options.userId,
    target:
      options.mode === "single" && options.url
        ? { url: options.url, language }
        : null,
    lines: [],
    lineCount: 0,
    summary: [],
    error: null,
    finishedAt: null,
    subscribers: new Set(),
  };

  globalForScrape.competitionScrapeJob = job;

  // Fire-and-forget: the run continues independently of any HTTP response.
  void runScrape(job, baseUrl, language);

  return getScrapeJobSnapshot();
}

function finish(
  job: ScrapeJobState,
  outcome: { status: "succeeded" } | { status: "failed"; error: string },
): void {
  job.finishedAt = new Date().toISOString();

  if (outcome.status === "succeeded") {
    job.status = "succeeded";
    job.summary = job.lines.slice(-SUMMARY_LINE_COUNT);
    notify(job, { type: "done", summary: job.summary });
  } else {
    job.status = "failed";
    job.error = outcome.error;
    notify(job, { type: "error", message: outcome.error });
  }

  // Drop subscribers — the stream endpoint closes them on the terminal event.
  job.subscribers.clear();
}

async function runScrape(
  job: ScrapeJobState,
  baseUrl: string,
  language: ScrapeLanguage,
): Promise<void> {
  const endpoint = job.mode === "all" ? "/scrape-all" : "/scrape";
  const body =
    job.mode === "all"
      ? {}
      : { url: job.target?.url, language: job.target?.language ?? language };

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.status === 409) {
      finish(job, {
        status: "failed",
        error: "A scrape is already running on the scraper server.",
      });
      return;
    }

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      finish(job, {
        status: "failed",
        error:
          text ||
          `Scraper responded with ${response.status} ${response.statusText}`,
      });
      return;
    }

    // Stream-read newline-delimited UTF-8 text (see scrape-on-demand spec).
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.length > 0) {
          appendLine(job, line);
        }
      }
    }

    if (buffer.length > 0) {
      appendLine(job, buffer);
    }

    finish(job, { status: "succeeded" });
  } catch (err) {
    finish(job, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
