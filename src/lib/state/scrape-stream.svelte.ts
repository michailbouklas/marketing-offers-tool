import { toast } from "svelte-sonner";
import { browser } from "$app/environment";

/**
 * App-global client store for the on-demand competition scrape.
 *
 * Imported by the persistent root layout so the SSE connection and the
 * completion toast survive client-side navigation and are not tied to the
 * scrape-sessions page or the dialog. The server owns the actual scrape; this
 * store only mirrors its state and renders the live log.
 */

export type ScrapeStatus = "idle" | "running" | "succeeded" | "failed";
export type ScrapeMode = "all" | "single";
export type ScrapeLanguage = "en" | "el";

/** Mirror of the server's `ScrapeJobSnapshot` (kept local to avoid importing a `.server` module). */
export type ScrapeSnapshot =
  | { status: "idle" }
  | {
      status: "running" | "succeeded" | "failed";
      mode: ScrapeMode;
      startedAt: string;
      startedByUserId: string;
      target: { url: string; language: ScrapeLanguage } | null;
      lines: string[];
      summary: string[];
      error: string | null;
      finishedAt: string | null;
    };

export interface StartScrapeRequest {
  mode: ScrapeMode;
  url?: string;
  language?: ScrapeLanguage;
}

class ScrapeStreamStore {
  status = $state<ScrapeStatus>("idle");
  lines = $state<string[]>([]);
  mode = $state<ScrapeMode | null>(null);
  startedAt = $state<string | null>(null);
  summary = $state<string[]>([]);
  error = $state<string | null>(null);

  #source: EventSource | null = null;
  #initialized = false;

  get isRunning(): boolean {
    return this.status === "running";
  }

  /** Seed state from an SSR/status snapshot without opening a connection. */
  hydrate(snapshot: ScrapeSnapshot | null | undefined): void {
    if (!snapshot) {
      return;
    }

    if (snapshot.status === "idle") {
      this.status = "idle";
      return;
    }

    this.status = snapshot.status;
    this.mode = snapshot.mode;
    this.startedAt = snapshot.startedAt;
    this.lines = snapshot.lines.slice();
    this.summary = snapshot.summary.slice();
    this.error = snapshot.error;
  }

  /**
   * Browser-only, idempotent: seed from an optional SSR snapshot and reconnect
   * if a scrape is already running. Runs at most once per page load — the store
   * is a module singleton, so all interaction is deferred to the browser to
   * avoid mutating shared state during SSR.
   */
  async init(snapshot?: ScrapeSnapshot | null): Promise<void> {
    if (!browser || this.#initialized) {
      return;
    }
    this.#initialized = true;

    this.hydrate(snapshot);
    if (this.isRunning) {
      this.connect();
      return;
    }

    // No SSR snapshot (e.g. initialized from the root layout) — ask the server.
    if (!snapshot) {
      try {
        const res = await fetch("/api/competition/scrape/status");
        if (res.ok) {
          this.hydrate((await res.json()) as ScrapeSnapshot);
          if (this.isRunning) {
            this.connect();
          }
        }
      } catch {
        // Status is best-effort; the user can still trigger a scrape manually.
      }
    }
  }

  /** Trigger a new scrape and begin streaming its output. */
  async start(request: StartScrapeRequest): Promise<void> {
    if (this.isRunning) {
      toast.error("A scrape is already running. Please wait for it to finish.");
      return;
    }

    try {
      const res = await fetch("/api/competition/scrape/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });

      if (res.status === 409) {
        toast.error(
          "A scrape is already running. Please wait for it to finish.",
        );
        await this.refreshStatus();
        return;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        toast.error(text || `Failed to start scrape (${res.status}).`);
        return;
      }

      const snapshot = (await res.json()) as ScrapeSnapshot;
      this.lines = [];
      this.summary = [];
      this.error = null;
      this.hydrate(snapshot);
      this.connect();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  private async refreshStatus(): Promise<void> {
    try {
      const res = await fetch("/api/competition/scrape/status");
      if (res.ok) {
        this.hydrate((await res.json()) as ScrapeSnapshot);
      }
    } catch {
      // ignore
    }
  }

  /** Open the SSE connection (guards against duplicates). */
  connect(): void {
    if (!browser || this.#source) {
      return;
    }

    // Rebuild the log from the server's authoritative replay on every explicit
    // connect (fresh start or reconnect after reload). The browser's own
    // transient auto-reconnects keep the existing lines and resume via
    // Last-Event-ID, so they don't clear here.
    this.lines = [];

    const source = new EventSource("/api/competition/scrape/stream");
    this.#source = source;

    source.addEventListener("log", (e) => {
      this.lines = [...this.lines, (e as MessageEvent).data as string];
    });

    source.addEventListener("done", (e) => {
      try {
        this.summary = JSON.parse((e as MessageEvent).data) as string[];
      } catch {
        // keep existing summary
      }
      this.status = "succeeded";
      toast.success("Scrape completed");
      this.#close();
    });

    // Terminal failure reported by the server (named SSE event with payload).
    source.addEventListener("failed", (e) => {
      const message = (e as MessageEvent).data as string;
      this.status = "failed";
      this.error = message;
      toast.error(message || "Scrape failed.");
      this.#close();
    });

    source.addEventListener("idle", () => {
      this.status = "idle";
      this.#close();
    });

    // Native transport "error" events (no payload) mean the connection dropped;
    // the browser auto-reconnects and resumes via Last-Event-ID, so ignore them.
  }

  #close(): void {
    this.#source?.close();
    this.#source = null;
  }
}

export const scrapeStream = new ScrapeStreamStore();
