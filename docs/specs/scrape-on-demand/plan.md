# Plan: "Scrape Now" with navigation-surviving live log streaming

## Context

The `competition/offers/scrape-sessions` page is a super-user audit view of past
scraper runs (data read from ClickHouse). There is currently **no way to trigger a
scrape from the UI** — runs are kicked off elsewhere.

We want a `Scrape Now` button on that page that triggers an on-demand scrape against
the remote scraper server (`docs/specs/scrape-on-demand/high-level.md`) and shows the
**live log output** in a dialog. The remote server streams newline-delimited text and
allows **only one scrape at a time** (returns `409` otherwise).

The hard requirement: **the scrape must keep running and stay observable even if the
user closes the dialog or navigates to another page.** When it finishes, a
`Scrape completed` toast must fire from anywhere in the app, and returning to the
scrape-sessions page must clearly show that a run is in progress (with the button
disabled).

### Key design decision — who holds the connection

If the browser held the streaming `fetch` to the remote scraper directly, navigating
away (which tears down page-level JS, though the root layout persists) and especially
closing the tab would kill the scrape's observer. The robust answer:

- **The SvelteKit Node server owns the scrape.** It opens the streaming request to the
  remote scraper, reads the stream, and keeps an in-memory singleton job (log buffer +
  status + summary). The scrape's lifecycle is independent of any browser.
- **The browser is only a viewer**, subscribing via **Server-Sent Events (SSE)**. SSE
  is the right transport here: the data flow is one-way (server → client), text-based,
  trivially reconnectable, and needs no extra WebSocket infrastructure. A viewer can
  disconnect and reconnect (navigate away / come back) without affecting the job.
- A **global client store** lives in the **root layout** (which persists across
  client-side navigation), so the SSE connection and the completion toast are not tied
  to the page or dialog.

> Scope note: the in-memory singleton assumes a **single Node server instance** (the
> project runs on the Node adapter). The remote scraper's own `409` lock is the real
> cross-instance guard. This is acceptable for now; documented as a limitation.

The user confirmed `Scrape Now` should default to the **full batch** (`/scrape-all`)
and the dialog should **also offer an optional single-URL input** (`/scrape`).

---

## Architecture overview

```
[ Scrape Now button ]                         remote scraper server
        │ POST /api/competition/scrape/start        ▲  POST /scrape-all | /scrape
        ▼                                            │  (streamed text/plain)
  SvelteKit server  ──── ScrapeJobManager (singleton on globalThis) ──── reads stream,
        ▲                  • status, mode, lines[] (ring buffer), summary, error          buffers lines
        │ GET /api/competition/scrape/stream (SSE)   │ notifies subscribers
        ▼                                            ▼
  Global client store (root layout) ── EventSource ── live lines → dialog console
        │                                              └─ "done" → toast "Scrape completed"
        ├─ banner on scrape-sessions page when running
        └─ disables Scrape Now while running
```

---

## Files to create

### 1. Server job manager — `src/lib/services/competition/scrape-job.server.ts`

The heart of the feature. A process-wide singleton stored on `globalThis` (mirrors the
existing `globalForEnv` caching pattern in `src/lib/server/env.ts`).

State shape:

```ts
type ScrapeStatus = "running" | "succeeded" | "failed";
type ScrapeMode = "all" | "single";

interface ScrapeJobState {
  status: ScrapeStatus;
  mode: ScrapeMode;
  startedAt: string; // ISO
  startedByUserId: string;
  target?: { url: string; language: "en" | "el" }; // single mode only
  lines: string[]; // ring buffer, capped (e.g. last 2000)
  summary: string[]; // trailing summary lines captured at completion
  error?: string;
  finishedAt?: string;
  subscribers: Set<(evt: ScrapeStreamEvent) => void>;
}
```

`ScrapeStreamEvent` is a discriminated union: `{type:"log", line}` |
`{type:"done", summary}` | `{type:"error", message}`.

Exports:

- `getScrapeJobSnapshot()` → serializable status object (no subscribers), for the
  status endpoint and SSR.
- `startScrape({ mode, url, language, userId })`:
  - If a job exists with `status === "running"` → throw a typed `ScrapeAlreadyRunningError`
    (mapped to HTTP 409 by the endpoint).
  - Resolve the remote base URL (see env helper below); if missing, throw a clear config error.
  - Create the job state, store on `globalThis`, then **fire-and-forget** `runScrape(job)`
    (do **not** await — the HTTP response returns immediately).
- `subscribeToScrape(cb)` → pushes events to a new SSE viewer; returns an unsubscribe fn.
- Internal `runScrape(job)`:
  - `fetch(remoteUrl + (mode==="all" ? "/scrape-all" : "/scrape"), { method:"POST",
headers:{"content-type":"application/json"}, body })` — body is `{}` for all, or
    `{ url, language }` for single.
  - If remote returns `409` → mark job `failed`, `error = "A scrape is already running on the scraper."`, notify, return.
  - If `!response.ok` → read text, mark failed, notify.
  - Stream-read the body using the exact reader/decoder loop from the spec
    (`docs/specs/scrape-on-demand/high-level.md`, "Consuming the stream"): split on
    `/\r?\n/`, push each line into the ring buffer, notify subscribers with a `log` event.
  - On normal end → `status="succeeded"`, capture trailing summary lines, `finishedAt`,
    notify `done`. On thrown error → `status="failed"`, notify `error`.
  - Cap `lines` length so a huge `/scrape-all` batch can't grow memory unbounded; note
    truncation by keeping only the tail.

### 2. Env helper — extend `src/lib/server/env.ts`

Add `getRemoteScraperUrl(): string | undefined` reusing the existing private `readEnv`
helper (reads `.env` file → `process.env` → `$env/dynamic/private`). Trim a trailing
slash so endpoint concatenation is safe. Also add `REMOTE_SCRAPER_URL` to `.env.example`.

### 3. API endpoints (new `+server.ts` files)

All three gated with `requireApiPermission(event, { urlsToScrape: ["manage"] })` from
`src/lib/server/auth-guards.ts` — the existing scrape-related permission (held by
`superUser`, who is also the only role that can reach this page). Follow the POST handler
convention in `src/routes/api/copy/generate/+server.ts` (Zod-validated body, `error()` /
`json()` from `@sveltejs/kit`).

- **`src/routes/api/competition/scrape/start/+server.ts`** — `POST`
  - Body (Zod): `{ mode: "all" | "single", url?: string (valid URL), language?: "en"|"el" }`.
    Require `url` when `mode === "single"`.
  - Calls `startScrape(...)`. Returns `json(getScrapeJobSnapshot())` on success.
  - Maps `ScrapeAlreadyRunningError` → `error(409, ...)`; missing config → `error(503, ...)`.

- **`src/routes/api/competition/scrape/status/+server.ts`** — `GET`
  - Returns `json(getScrapeJobSnapshot())` (or an `{ status: "idle" }` shape when no job).

- **`src/routes/api/competition/scrape/stream/+server.ts`** — `GET` (SSE)
  - If no job exists → return a short SSE response that emits a single `idle` event and
    closes (so the client can cleanly fall back).
  - Build a `ReadableStream`:
    1. On start, **replay** the job's buffered `lines` as `log` events (late joiner sees history).
    2. If the job is already finished, emit the terminal `done`/`error` event and close —
       this is what lets a viewer who navigates **back after** completion still receive
       the toast on reconnect (within the process lifetime).
    3. Otherwise `subscribeToScrape(...)` and forward each event; send a heartbeat comment
       (`: ping\n\n`) on an interval to keep proxies from closing the connection; clean up
       the subscription and interval on `cancel`.
  - Headers: `content-type: text/event-stream`, `cache-control: no-cache`,
    `connection: keep-alive`. Return `new Response(stream, { headers })`.
  - SSE framing: `event: <type>\ndata: <payload>\n\n`. Log payloads are raw lines;
    `done` carries the summary as JSON; `error` carries the message.

### 4. Global client store — `src/lib/state/scrape-stream.svelte.ts`

A module-level **singleton** class instance using Svelte 5 runes (a `.svelte.ts` rune
store; simpler than context for a truly app-global concern, while the sidebar's
`context.svelte.ts` remains the reference for the class+runes style).

Reactive fields: `status`, `lines: string[]`, `mode`, `startedAt`, `summary`, `error`.

Methods:

- `hydrate(snapshot)` — seed from SSR/`status` data so the banner shows without a flash.
- `init()` — browser-only, idempotent; if `status === "running"`, call `connect()`.
- `start({ mode, url, language })` — `POST /api/competition/scrape/start`; on `200` set
  running + clear lines + `connect()`; on `409` `toast.error("A scrape is already
running…")` then refresh status; other errors → `toast.error`.
- `connect()` — guard against double-connect; open
  `new EventSource("/api/competition/scrape/stream")`; handlers per event type:
  `log` → push to `lines`; `done` → `status="succeeded"`, **`toast.success("Scrape completed")`**,
  close ES; `error` → `status="failed"`, `toast.error(message)`, close ES; `idle` → reset + close.
- Export the singleton instance (e.g. `export const scrapeStream = new ScrapeStreamStore()`).

Because this module is imported by the **persistent root layout**, the `EventSource` and
the completion toast survive client-side navigation.

### 5. Dialog component — `src/lib/components/competition/scrape-now-dialog.svelte`

Uses the shadcn-svelte `Dialog` (`bind:open` pattern, per
`src/lib/components/admin/pending-submission-dialog.svelte`). Props: `bind:open`.

- When `scrapeStream.status !== "running"` and the user hasn't started yet: show a small
  form — a mode toggle (**All registered URLs** vs **Single URL**); for single, a URL
  text input + language select (`en`/`el`, Zod-matched). A **Start scrape** button calls
  `scrapeStream.start(...)`.
- A **console `<div>`**: scrollable, fixed-height, monospace (`font-mono text-xs`),
  rendering `scrapeStream.lines`. Auto-scroll to bottom on new lines via an `$effect`.
- Header reflects state (running / completed / failed); footer has a Close button. Closing
  the dialog does **not** stop the scrape (the server owns it).

---

## Files to modify

### `src/routes/competition/offers/scrape-sessions/+page.server.ts`

- Add `scrapeStatus: getScrapeJobSnapshot()` to the returned data for SSR (so the banner +
  disabled button render immediately on navigation-back, no flash). Keep `requireSuperUser`.

### `src/routes/competition/offers/scrape-sessions/+page.svelte`

- Import the `scrapeStream` singleton and the dialog component; `let dialogOpen = $state(false)`.
- On mount, `scrapeStream.hydrate(data.scrapeStatus)` then `scrapeStream.init()`.
- In the header `<section>` (next to "Back to offers", line ~122): add a **`Scrape Now`**
  `Button` that sets `dialogOpen = true` (and triggers the default full-batch start), with
  `disabled={scrapeStream.status === "running"}`.
- Add an in-progress **banner** (shadcn-style alert / bordered `Card` strip) shown
  `{#if scrapeStream.status === "running"}` with text like "A scrape session is under way…"
  and a **View progress** button that reopens the dialog.
- Render `<ScrapeNowDialog bind:open={dialogOpen} />`.

### `src/routes/+layout.svelte`

- Import the `scrapeStream` singleton; inside an `$effect`/`onMount` guarded by `if (user)`
  and browser context, call `scrapeStream.init()` once so a running scrape started in a
  previous page (or by reconnecting) keeps streaming and can fire the global toast. The
  `<Toaster />` is already mounted here.

### `.env.example`

- Add `REMOTE_SCRAPER_URL="http://200.1.3.249:3506"` (current value from the spec; confirm with backend team).

---

## Reuse (don't reinvent)

- Streaming reader loop: copy from the spec's "Consuming the stream" section.
- Env reading: existing `readEnv` in `src/lib/server/env.ts`.
- Toasts: `import { toast } from "svelte-sonner"`; `<Toaster />` already in root layout.
- Dialog: `src/lib/components/ui/dialog` + the `bind:open` pattern in
  `src/lib/components/admin/pending-submission-dialog.svelte`.
- API handler/auth conventions: `src/routes/api/copy/generate/+server.ts` +
  `requireApiPermission` from `src/lib/server/auth-guards.ts`.
- Button/Card/Badge usage already present in the scrape-sessions page.

---

## Verification

1. Add `REMOTE_SCRAPER_URL` to `.env`. Run `bun run dev`.
2. As a super user, open `/competition/offers/scrape-sessions`. Click **Scrape Now** →
   dialog opens, full-batch starts, log lines stream live into the console div.
3. **Navigate away** (e.g. to `/competition/offers`) while running → on completion a
   `Scrape completed` toast appears regardless of the current page.
4. While running, **navigate back** to scrape-sessions → the in-progress banner shows,
   **Scrape Now** is disabled, and **View progress** reopens the dialog showing buffered
   history then continuing live.
5. **Single-URL mode**: in the dialog choose Single URL, enter a foody/wolt URL + language,
   Start → streams just that URL.
6. **409 path**: trigger a second start while one is running (or via `curl`) → UI shows
   "already running" error, button stays disabled.
7. Endpoint smoke test with `curl` (mirror the spec's curl examples) against
   `/api/competition/scrape/start`, `/status`, and `/stream` (use `curl -N` for SSE).
8. Run `bun run svelte-autofixer` (project rule) and `rtk tsc` after changes.

### Known limitations (call out to user)

- In-memory job state assumes a single Node instance and does **not** survive a server
  restart (a running scrape would lose its observer, though the remote keeps running).
- Log ring buffer is capped; very long `/scrape-all` runs show only the tail in late-joining viewers.
