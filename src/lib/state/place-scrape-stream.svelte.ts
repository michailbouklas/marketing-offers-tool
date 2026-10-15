import { toast } from "svelte-sonner";
import { browser } from "$app/environment";
import { invalidateAll } from "$app/navigation";
import type {
  ScrapeLogStream,
  ScrapeRunEvent,
  ScrapeRunSnapshot,
  ScrapeRunStatus,
  ScrapeRunsStatus,
  ScrapeStage,
} from "$lib/services/google-reviews-admin/scrape-run";

/**
 * Client store for on-demand place scrapes (Places manager), modelled on
 * `scrape-stream.svelte.ts`. It owns the single `EventSource` to
 * `/api/admin/google-reviews/places/[id]/scrape/stream`, so the dialog can be
 * closed and reopened without touching the connection, and a page reload
 * re-attaches through `init()`.
 */

export type PlaceScrapeLogLine = {
  seq: number;
  stream: ScrapeLogStream;
  line: string;
};

export type PlaceScrapeRunView = {
  placeId: number;
  query: string;
  status: ScrapeRunStatus;
  startedAt: string;
  finishedAt: string | null;
  runId: string | null;
  stages: ScrapeStage[];
  logs: PlaceScrapeLogLine[];
  /** Highest event `seq` applied; replayed duplicates are ignored. */
  lastSeq: number;
  exitCode: number | null;
  error: string | null;
};

const MAX_LOG_LINES = 2000;
const STATUS_URL = "/api/admin/google-reviews/places/scrape/status";

function scrapeUrl(placeId: number, suffix = "") {
  return `/api/admin/google-reviews/places/${placeId}/scrape${suffix}`;
}

function applyEvent(view: PlaceScrapeRunView, event: ScrapeRunEvent): void {
  if (event.seq <= view.lastSeq) {
    return;
  }
  view.lastSeq = event.seq;

  switch (event.type) {
    case "start":
      view.query = event.query || view.query;
      if (event.stages.length > 0 && view.stages.length === 0) {
        view.stages = event.stages.map((stage) => ({
          stage,
          status: "started",
          durationMs: null,
          counts: null,
          error: null,
        }));
      }
      return;
    case "run":
      view.runId = event.runId;
      return;
    case "stage": {
      const stage: ScrapeStage = {
        stage: event.stage,
        status: event.status,
        durationMs: event.durationMs,
        counts: event.counts,
        error: event.error,
      };
      const index = view.stages.findIndex((s) => s.stage === stage.stage);
      if (index === -1) {
        view.stages.push(stage);
      } else {
        view.stages[index] = stage;
      }
      return;
    }
    case "log":
      view.logs.push({
        seq: event.seq,
        stream: event.stream,
        line: event.line,
      });
      if (view.logs.length > MAX_LOG_LINES) {
        view.logs.splice(0, view.logs.length - MAX_LOG_LINES);
      }
      return;
    case "done":
      view.exitCode = event.exitCode;
      view.runId = event.runId ?? view.runId;
      if (event.error) {
        view.error = event.error;
      }
      return;
    case "error":
      view.error = event.message;
      return;
  }
}

function viewFromSnapshot(snapshot: ScrapeRunSnapshot): PlaceScrapeRunView {
  const view: PlaceScrapeRunView = {
    placeId: snapshot.placeId,
    query: snapshot.query,
    status: snapshot.status,
    startedAt: snapshot.startedAt,
    finishedAt: snapshot.finishedAt,
    runId: snapshot.runId,
    stages: [],
    logs: [],
    lastSeq: 0,
    exitCode: null,
    error: snapshot.error,
  };

  for (const event of snapshot.events) {
    applyEvent(view, event);
  }

  // The buffer may have lost early stage events; the snapshot's stage list is
  // authoritative.
  if (snapshot.stages.length > 0) {
    view.stages = snapshot.stages.map((stage) => ({ ...stage }));
  }

  return view;
}

class PlaceScrapeStreamStore {
  runs = $state<Record<number, PlaceScrapeRunView>>({});
  activePlaceId = $state<number | null>(null);

  #source: EventSource | null = null;
  #sourcePlaceId: number | null = null;
  #initialized = false;

  get isRunning(): boolean {
    return this.activePlaceId !== null;
  }

  getRun(placeId: number): PlaceScrapeRunView | null {
    return this.runs[placeId] ?? null;
  }

  /** Replace the view for one place from a server snapshot. */
  hydrate(snapshot: ScrapeRunSnapshot): void {
    this.runs[snapshot.placeId] = viewFromSnapshot(snapshot);
    this.#syncActive(snapshot.placeId, snapshot.status);
  }

  hydrateStatus(status: ScrapeRunsStatus): void {
    for (const snapshot of Object.values(status.recent)) {
      this.hydrate(snapshot);
    }
    if (status.active) {
      this.hydrate(status.active);
    }
  }

  /**
   * Browser-only, idempotent: seed from the SSR status (or fetch it) and
   * re-attach to a run that is already in progress.
   */
  async init(status?: ScrapeRunsStatus | null): Promise<void> {
    if (!browser || this.#initialized) {
      return;
    }
    this.#initialized = true;

    if (status) {
      this.hydrateStatus(status);
    } else {
      await this.refreshStatus();
    }

    if (this.activePlaceId !== null) {
      this.connect(this.activePlaceId);
    }
  }

  async refreshStatus(): Promise<void> {
    try {
      const res = await fetch(STATUS_URL, {
        headers: { accept: "application/json" },
      });
      if (res.ok) {
        this.hydrateStatus((await res.json()) as ScrapeRunsStatus);
      }
    } catch {
      // Best effort; the user can still start a run manually.
    }
  }

  /** Start a run for a place and begin streaming. Resolves to true on success. */
  async start(placeId: number): Promise<boolean> {
    if (this.isRunning) {
      toast.error("A scrape is already running. Wait for it to finish.");
      return false;
    }

    try {
      const res = await fetch(scrapeUrl(placeId), {
        method: "POST",
        headers: { accept: "application/json" },
      });

      if (res.status === 409) {
        const body = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        toast.error(
          body?.message ??
            "A scrape is already running. Wait for it to finish.",
        );
        await this.refreshStatus();
        if (this.activePlaceId !== null) {
          this.connect(this.activePlaceId);
        }
        return false;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        toast.error(
          body?.message ?? `Failed to start the scrape (${res.status}).`,
        );
        return false;
      }

      this.hydrate((await res.json()) as ScrapeRunSnapshot);
      this.connect(placeId);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  /** Open (or keep) the SSE connection for a place; only one at a time. */
  connect(placeId: number): void {
    if (!browser) {
      return;
    }
    if (this.#source && this.#sourcePlaceId === placeId) {
      return;
    }
    this.#close();

    const source = new EventSource(scrapeUrl(placeId, "/stream"));
    this.#source = source;
    this.#sourcePlaceId = placeId;

    source.addEventListener("run", (e) => {
      const view = this.runs[placeId];
      if (!view) {
        return;
      }
      try {
        applyEvent(
          view,
          JSON.parse((e as MessageEvent).data) as ScrapeRunEvent,
        );
      } catch {
        // Malformed frame; skip it.
      }
    });

    source.addEventListener("finished", (e) => {
      let status: Exclude<ScrapeRunStatus, "running"> = "failed";
      let error: string | null = null;
      try {
        const payload = JSON.parse((e as MessageEvent).data) as {
          status?: string;
          error?: string | null;
        };
        status = payload.status === "succeeded" ? "succeeded" : "failed";
        error = payload.error ?? null;
      } catch {
        // Treat as failed.
      }

      const view = this.runs[placeId];
      if (view) {
        view.status = status;
        view.error = error ?? view.error;
        view.finishedAt ??= new Date().toISOString();
      }
      this.#syncActive(placeId, status);

      if (status === "succeeded") {
        toast.success(
          `Scrape finished for "${view?.query ?? `place #${placeId}`}".`,
        );
      } else {
        toast.error(error ?? "Scrape failed.");
      }

      this.#close();
      // Refresh the table so `last_scraped_at` reflects the run.
      void invalidateAll();
    });

    source.addEventListener("idle", () => {
      const view = this.runs[placeId];
      if (view && view.status === "running") {
        view.status = "failed";
        view.error =
          "The server no longer tracks this run (it may have restarted). Check the scraper's pipeline runs.";
      }
      this.#syncActive(placeId, "failed");
      this.#close();
    });

    // Native transport "error" events mean the connection dropped; the browser
    // auto-reconnects and resumes via Last-Event-ID, so they are ignored.
  }

  #syncActive(placeId: number, status: ScrapeRunStatus): void {
    if (status === "running") {
      this.activePlaceId = placeId;
    } else if (this.activePlaceId === placeId) {
      this.activePlaceId = null;
    }
  }

  #close(): void {
    this.#source?.close();
    this.#source = null;
    this.#sourcePlaceId = null;
  }
}

export const placeScrapeStream = new PlaceScrapeStreamStore();
