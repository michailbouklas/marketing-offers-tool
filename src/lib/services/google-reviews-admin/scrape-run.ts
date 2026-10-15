/**
 * Browser-safe types for the on-demand place scrape
 * (`POST /scrape-queries/{id}/scrape` on the Google Reviews scraper API).
 *
 * The SvelteKit server keeps one connection to the remote SSE stream per run
 * and buffers what it receives (`./scrape-run.server.ts`); browsers follow a
 * run through `/api/admin/google-reviews/places/[id]/scrape/stream`, which
 * replays the buffer and then forwards live events. Closing the dialog never
 * touches the run.
 */

export type ScrapeRunStatus = "running" | "succeeded" | "failed";

export type ScrapeStageStatus =
  | "started"
  | "ok"
  | "warn"
  | "failed"
  | "skipped";

export type ScrapeStage = {
  stage: string;
  status: ScrapeStageStatus;
  durationMs: number | null;
  counts: Record<string, number> | null;
  error: string | null;
};

export type ScrapeLogStream = "stdout" | "stderr";

export type ScrapeDoneStatus = "ok" | "warn" | "failed";

/** One remote SSE frame, normalised, with our own monotonic sequence number. */
export type ScrapeRunEvent =
  | {
      seq: number;
      type: "start";
      query: string;
      stages: string[];
      startedAt: string | null;
    }
  | { seq: number; type: "run"; runId: string | null; runDir: string | null }
  | ({ seq: number; type: "stage" } & ScrapeStage)
  | { seq: number; type: "log"; stream: ScrapeLogStream; line: string }
  | {
      seq: number;
      type: "done";
      status: ScrapeDoneStatus;
      exitCode: number | null;
      runId: string | null;
      error: string | null;
    }
  | { seq: number; type: "error"; message: string };

export type ScrapeRunSnapshot = {
  placeId: number;
  query: string;
  status: ScrapeRunStatus;
  startedAt: string;
  startedByUserId: string;
  finishedAt: string | null;
  runId: string | null;
  stages: ScrapeStage[];
  /** Buffered tail of events (oldest first). */
  events: ScrapeRunEvent[];
  /** Total events ever recorded; the last buffered event has this `seq`. */
  eventCount: number;
  error: string | null;
};

/**
 * Everything the page needs to seed its state: the single run in progress (the
 * scraper only allows one at a time) and the last finished run per place.
 */
export type ScrapeRunsStatus = {
  active: ScrapeRunSnapshot | null;
  recent: Record<number, ScrapeRunSnapshot>;
};

/** Frames our SSE route sends to the browser. */
export type ScrapeRunStreamFrame =
  | { kind: "event"; event: ScrapeRunEvent }
  | {
      kind: "finished";
      status: Exclude<ScrapeRunStatus, "running">;
      error: string | null;
    };

export class ScrapeRunAlreadyRunningError extends Error {
  constructor(
    public readonly activePlaceId: number,
    public readonly activeQuery: string,
  ) {
    super(
      `A scrape is already running for "${activeQuery}". Wait for it to finish.`,
    );
    this.name = "ScrapeRunAlreadyRunningError";
  }
}
