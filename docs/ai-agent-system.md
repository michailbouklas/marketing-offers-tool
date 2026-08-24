# AI Agent System (Mastra + Chat UI) — Reproduction Guide

Technical reference for reproducing this app's AI assistant system on another
codebase. The stack: **Mastra** agents on the server, streamed to a **Svelte 5
chat UI** over the **AI SDK v6 UIMessage protocol**, with conversation history
persisted per user + app section in PostgreSQL.

Written for an agent (Claude Code) doing the port. File paths refer to this
repo; copy the patterns, not necessarily the literal files.

---

## 1. Package surface

From `package.json` (SvelteKit app, `bun` for packages, Node adapter for prod):

```jsonc
// dependencies
"@ai-sdk/svelte": "^5.0.32",      // Chat class (client)
"ai": "^7.0.32",                  // DefaultChatTransport, createUIMessageStreamResponse
"@mastra/core": "^1.51.0",        // Mastra, Agent, createTool, Workspace, RequestContext
"@mastra/ai-sdk": "^1.6.2",       // handleChatStream, toAISdkMessages (UIMessage bridge)
"@mastra/memory": "^1.23.0",      // Memory (threads/messages)
"@mastra/pg": "^1.16.0",          // PostgresStore
"@mastra/clickhouse": "^1.12.0",  // ClickhouseStoreVNext (observability only, optional)
"@mastra/observability": "^1.16.1",
"marked": "^18",                  // assistant markdown → HTML
"dompurify": "^3",                // sanitize that HTML
// devDependencies
"mastra": "^1.19.0"               // `mastra dev` playground CLI
```

The wire protocol everywhere is **AI SDK UIMessage v6** — the `version: "v6"`
argument appears in `handleChatStream` and every `toAISdkMessages` call, and
must match the `ai`/`@ai-sdk/svelte` major in use.

## 2. Directory layout

```
src/lib/server/mastra/
  index.ts                    # Mastra instance: workspace, agents, storage, observability
  memory.ts                   # shared Memory (threads/messages) for all agents
  env.ts                      # process.env/.env reader — NO SvelteKit $env imports
  chat-registry.ts            # agentId → {permissions, brandScoped} allowlist for the API
  object-store.ts             # Supabase/local object store (env-free twin of the app's)
  dev/index.ts                # eager `export const mastra` for the `mastra dev` playground
  agents/
    invoices-agent.ts         # one Agent per app section
    google-reviews-agent.ts
    competition-agent.ts
    offers-data-quality-agent.ts
    sales-agent.ts
  tools/
    shared.ts                 # tools every agent gets (generateExcel)
    generate-excel.ts         # officecli-backed xlsx generation → object store
    query-*-sql.ts            # one read-only SQL tool per agent/domain
  workspace/
    skills/<skill-name>/SKILL.md   # agent-loadable skills (see §4)

src/lib/components/ai-chat/
  chat-widget.svelte          # floating popover chat (per-section pages)
  chat-page.svelte            # full-page chat with sidebar (/sales/chat)
  markdown.ts                 # marked + DOMPurify renderer
  excel-tool.ts               # client-side helpers for the generateExcel tool part

src/routes/api/ai/chat/+server.ts          # POST = stream, GET = history
src/routes/api/ai/files/[id]/[filename]/+server.ts  # Excel download
src/routes/api/admin/chat-usage/conversation/+server.ts  # superUser conversation reader
src/lib/services/chat-usage.server.ts      # admin usage stats via Prisma views
prisma/migrations/20260721130000_add_ai_chat_history_views/  # read-only views over mastra schema
```

**Critical constraint:** nothing under `src/lib/server/mastra/` may import
SvelteKit virtual modules (`$env/*`, `$app/*`, `$lib/server/prisma`). The
directory must be bundleable by the standalone `mastra dev` CLI
(`bun run mastra:dev` → `mastra dev --dir src/lib/server/mastra/dev --env .env`).
That is why `env.ts` reads `process.env` with a manual `.env` fallback, the
SQL tools create their own `@clickhouse/client`/`pg` clients instead of
reusing the app's singletons, and `object-store.ts` mirrors the app's store
with env from `env.ts`.

## 3. The Mastra instance (`src/lib/server/mastra/index.ts`)

### 3.1 Lazy singleton

```ts
const globalForMastra = globalThis as typeof globalThis & {
  mastraCache?: Mastra;
};
export function getMastra(): Mastra {
  globalForMastra.mastraCache ??= createMastra();
  return globalForMastra.mastraCache;
}
```

- Cached on `globalThis` so dev HMR doesn't rebuild it (rebuilding leaks pg
  pools). Consequence: agent/memory config changes require a dev-server
  restart.
- **Only call `getMastra()` at request time, never at module scope** —
  SvelteKit imports server modules during `vite build` where no env/DB exists
  (Docker builder stage). The playground gets its eager export from
  `dev/index.ts` only.

### 3.2 Workspace (skills distribution)

```ts
const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: workspaceDir() }),
  skills: ["skills"], // subdirectory containing <skill>/SKILL.md folders
  tools: {
    // read-only: agents can list/read/load skills, never mutate
    [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: { enabled: false },
    [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: { enabled: false },
    [WORKSPACE_TOOLS.FILESYSTEM.AST_EDIT]: { enabled: false },
    [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: { enabled: false },
    [WORKSPACE_TOOLS.FILESYSTEM.MKDIR]: { enabled: false },
  },
});
```

`workspaceDir()` resolves `src/lib/server/mastra/workspace` by walking up to 4
directories from `process.cwd()` (because `mastra dev` runs from
`.mastra/output`), overridable with `MASTRA_WORKSPACE_DIR` — set that when
deploying a built app whose cwd doesn't contain the source tree.

### 3.3 Agents + storage + observability

```ts
return new Mastra({
  workspace,
  agents: {
    "invoices-agent": invoicesAgent,
    "google-reviews-agent": googleReviewsAgent,
    "competition-agent": competitionAgent,
    "offers-data-quality-agent": offersDataQualityAgent,
    "sales-agent": salesAgent,
  },
  storage: createStorage(),
  observability: new Observability({
    configs: {
      default: {
        serviceName: "marketing-offers-tool",
        exporters: [new MastraStorageExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
  server: { port: 4123 }, // only affects `mastra dev`; SvelteKit ignores it
});
```

`createStorage()` builds a `MastraCompositeStore`:

- **Default domain: `PostgresStore`** with `schemaName: "mastra"` on the app's
  `DATABASE_URL`. Mastra creates and migrates its own tables inside that
  schema (`mastra_threads`, `mastra_messages`, …) — Prisma never touches it.
- **Observability domain: `ClickhouseStoreVNext`** when `CLICKHOUSE_URL` is
  set (AI traces + metrics in `mastra_*` ClickHouse tables); falls back to
  Postgres with a console warning otherwise. Use the _VNext_ store — the base
  `ClickhouseStore` persists spans only and Mastra Studio then reports
  "Metrics are not available".

### 3.4 Model + env (`env.ts`)

`getAiChatEnv()` returns `{ OPENAI_API_KEY, AI_CHAT_MODEL }`:

- `AI_CHAT_MODEL` is a Mastra model-router string, `provider/model` (default
  `openai/gpt-4o-mini`); a bare model name is prefixed with `openai/`.
- Mastra's `openai/...` router reads the key from `process.env.OPENAI_API_KEY`,
  so `getAiChatEnv()` copies the `.env`-file value into `process.env` if
  missing. `createMastra()` calls it first for exactly this side effect.
- `readEnv()` cascade: project `.env` file **wins over** `process.env`
  (machine-level stale vars must not shadow project config).

## 4. Skills

Skills are directories under `workspace/skills/`, one `SKILL.md` each, with
YAML frontmatter:

```markdown
---
name: sales-sql
description: Full schema reference, SQL rules, pre-flight count checks, error-retry patterns, and vetted ClickHouse query examples for the Novasero POS sales tables.
---

# Sales SQL

...full schema tables, rules, vetted example queries...
```

Because `skills: ["skills"]` is set on the Workspace, Mastra automatically
exposes skill-listing/loading tools to every agent; the frontmatter
`description` is what the model sees when deciding to load one. The agent
instructions then direct usage explicitly, e.g. from the sales agent:

> Before writing non-trivial SQL, load the "sales-sql" skill for the full
> schema, query rules, and vetted examples. Load the topical skill when the
> question touches its area: "sales-offers", "sales-coupons", ...

Current skill inventory: `invoices-sql`, `google-reviews-sql`,
`competition-sql`, `data-quality-sql`, `dim-offers-sql`, `excel-generation`,
and 12 `sales-*` skills (schema + topical playbooks: brand mapping, offers,
coupons, combos, channels, discount cards, multi-brand, Pizza Hut specifics,
to-date/MTD-YTD rules, business overview).

**Design principle:** the base agent instructions carry a compact schema
summary + hard rules; the deep reference material (full column tables, vetted
SQL, edge-case playbooks) lives in skills that are loaded on demand. This
keeps the per-request system prompt small.

## 5. Agents (`agents/*.ts`)

One `Agent` per app section, all following the same shape (see
`sales-agent.ts` for the richest example):

```ts
export const salesAgent = new Agent({
  id: "sales-agent",
  name: "Sales Assistant",
  instructions: ({ requestContext }) => {
    // dynamic (brand-scoped agents)
    const brands = resolveScopedBrands(requestContext);
    return `${baseInstructions}\n\n${buildBrandScopeSection(brands)}`;
  },
  model: getAiChatEnv().AI_CHAT_MODEL, // "provider/model" router string
  tools: { ...sharedTools, querySalesSql }, // shared + one domain SQL tool
  memory: () => getChatMemory(), // lazy fn — see §6
});
```

- Non-scoped agents (e.g. `invoices-agent`) use a plain string `instructions`.
- Brand-scoped agents take `instructions` as a function of the per-request
  `RequestContext` and append a "Brand scope" section listing the caller's
  allowed brands (aliases + display names), with hard rules: every query must
  contain `lower(brand) IN (...)`; a question about an unassigned brand gets
  the exact reply "You're not assigned to this brand" with no tool calls;
  an empty brand list means "tell the user there's no data, call nothing".
- `memory` is a **function** so importing the agent module never touches
  `DATABASE_URL` (build-time import safety, same reasoning as `getMastra`).
- Instruction structure that works well (repeat per agent): data-model
  summary → skill-loading directives → hard rules (answer only from tool
  results, retry failed SQL up to 3× reading the error, row-cap awareness,
  read-only refusal, data-lag handling: anchor relative dates to
  `max(date_col)` not the clock, and report zeros together with the latest
  available data date) → Excel export etiquette → output format (GFM tables,
  EUR formatting, lead with the answer, don't show SQL unless asked).

### 5.1 Chat registry (`chat-registry.ts`)

The server-side allowlist that maps `agentId` → access policy; the API only
routes to agents listed here:

```ts
export type ChatAgentConfig = {
  permissions?: AppPermissions; // required app permission; omit = any authenticated user
  brandScoped?: boolean; // endpoint publishes the caller's brand scope
};
export const chatAgents: Record<string, ChatAgentConfig> = {
  "invoices-agent": { permissions: { aggregatorInvoices: ["view"] } },
  "google-reviews-agent": { permissions: { googleReviews: ["view"] } },
  "competition-agent": { permissions: { competition: ["view"] } },
  "offers-data-quality-agent": { brandScoped: true },
  "sales-agent": { permissions: { sales: ["view"] }, brandScoped: true },
};
export const BRAND_SCOPE_RUNTIME_KEY = "allowedBrandAliases";
export const BRAND_SCOPE_NAMES_RUNTIME_KEY = "allowedBrandNames";
```

The runtime-context key constants live here (not in agent modules) so the
endpoint can import them without eagerly constructing an Agent.

## 6. Conversation memory + database

### 6.1 Memory instance (`memory.ts`)

One `Memory` shared by **all** agents (thread ids are already namespaced per
agent, and sharing avoids one pg pool per agent):

```ts
new Memory({
  storage: new PostgresStore({
    id: "ai-chat-memory",
    connectionString: getDatabaseUrl(),
    schemaName: "mastra", // isolated from Prisma-managed "public"
  }),
  options: {
    lastMessages: 20, // context window recall depth
    generateTitle: {
      // AI titles for the history list
      model: "openai/gpt-4o-mini", // pinned cheap model regardless of AI_CHAT_MODEL
      instructions:
        "Generate a concise title (max 6 words) summarizing what the user is asking about. Plain text, no quotes.",
    },
  },
});
```

Also a `globalThis`-cached lazy singleton. The dedicated `"mastra"` Postgres
schema is the load-bearing decision: `@mastra/pg` creates/migrates its own
tables there, and Prisma migrations (which manage `public`) never see drift.

### 6.2 Scoping model — thread id namespacing

All scoping lives in the thread id, composed **server-side only**:

```
threadId = `<agentId>:<userId>:<sessionKey>`   // e.g. "sales-agent:usr_123:9f8e...-uuid"
resourceId = userId                            // Mastra's owner field
```

- `agentId` = app section (each section's widget talks to its own agent), so
  history is naturally partitioned per section.
- `userId` comes from the authenticated session — a client-supplied
  `sessionKey` (a UUID minted by the browser) can only ever address the
  caller's own conversations under that agent.
- "New chat" is just a fresh client UUID: old threads stay stored and
  recallable; nothing is deleted.

### 6.3 Persistence flow

The chat endpoint passes `memory: { thread: threadIdFor(...), resource: user.id }`
to `handleChatStream`; Mastra persists the user message and the streamed
assistant message (including tool-call parts) into
`mastra.mastra_threads` / `mastra.mastra_messages` automatically, and
generates the thread title after the first exchange. History retrieval is
`memory.recall({ threadId, resourceId })` →
`toAISdkMessages(recalled.messages, { version: "v6" })`, which returns the
exact UIMessage array the client renders. Thread listing is
`memory.listThreads({ filter: { resourceId: userId }, perPage: false })`
filtered by the `"<agentId>:<userId>:"` prefix.

### 6.4 Read-only Prisma views (admin/analytics access)

Migration `20260721130000_add_ai_chat_history_views`:

```sql
CREATE SCHEMA IF NOT EXISTS "mastra";
CREATE TABLE IF NOT EXISTS "mastra"."mastra_threads" (...);   -- shadow-DB replay only;
CREATE TABLE IF NOT EXISTS "mastra"."mastra_messages" (...);  -- no-ops on real DBs
CREATE VIEW "public"."ai_chat_threads"  AS SELECT ... FROM "mastra"."mastra_threads";
CREATE VIEW "public"."ai_chat_messages" AS SELECT ... FROM "mastra"."mastra_messages";
```

Declared in `schema.prisma` as `view ai_chat_threads` / `view ai_chat_messages`
(Prisma 7 `views` preview feature). This gives the app typed **read** access
(superUser `/admin/chat-usage` pages: totals, per-agent counts via
`split_part(id, ':', 1)`, per-user counts joined to `user`) without Prisma
Migrate owning Mastra's tables. Never write through the views.
`chat-usage.server.ts:parseThreadId` splits the namespaced id back into
`{agentId, userId, sessionKey}` (first and last `:` — userId may contain none).

The admin conversation reader (`/api/admin/chat-usage/conversation`) prefers
`memory.recall` + `toAISdkMessages` (same shape the widget renders) and falls
back to parsing the raw `content` JSON from the view for threads whose agent
is no longer registered.

## 7. The chat API (`src/routes/api/ai/chat/+server.ts`)

Single endpoint, two verbs.

### 7.1 POST — send + stream

Request body (sent by the client's `DefaultChatTransport` plus per-send extras):

```ts
const requestSchema = z.object({
  agentId: z.string(),
  sessionKey: z.uuid(),
  messages: z.array(z.record(z.string(), z.unknown())).min(1), // UIMessages, passed through
});
```

Handler sequence:

1. Zod-validate the envelope (Mastra validates the UIMessage format itself).
2. `authorizeAgent`: look up `chatAgents[agentId]` (400 on unknown), then
   either `requireApiPermission(event, agent.permissions)` or
   `requireAuthenticatedApiUser(event)`.
3. For `brandScoped` agents, build a `RequestContext`: resolve the caller's
   brands server-side (admin/superUser roles → all active brands, otherwise
   the user's assignments), drop brands with empty aliases (keeping alias and
   name arrays index-aligned), and `set(BRAND_SCOPE_RUNTIME_KEY, aliases)` +
   `set(BRAND_SCOPE_NAMES_RUNTIME_KEY, names)`. **Never derived from the
   request body.**
4. Stream:

```ts
const stream = await handleChatStream({
  mastra: getMastra(),
  agentId,
  version: "v6",
  params: {
    messages: body.data.messages as never,
    maxSteps: 8, // tool-call loop cap
    ...(requestContext ? { requestContext } : {}),
    memory: {
      thread: `${agentId}:${user.id}:${sessionKey}`,
      resource: user.id,
    },
  },
});
return createUIMessageStreamResponse({ stream }); // from "ai"
```

### 7.2 GET — history

- `?agentId=X` → `{ sessions: [{ key, title, updatedAt }] }`: lists the
  user's threads for that agent (prefix-filtered, newest first, key = the
  sessionKey suffix of the thread id, title = AI-generated or
  "Untitled conversation").
- `?agentId=X&session=<uuid>` → UIMessage array via `memory.recall` +
  `toAISdkMessages(..., { version: "v6" })`; unknown/empty thread returns
  `[]` (not an error). Same authorization as POST in both modes.

## 8. Tools

### 8.1 Read-only SQL tools (one per domain)

Each agent gets exactly one `createTool` SQL tool bound to its data source
(Postgres invoice tables, or a domain-specific ClickHouse database selected by
env: `CLICKHOUSE_SALES_DATABASE`, `CLICKHOUSE_COMPETITION_DATABASE`,
`CLICKHOUSE_GOOGLE_REVIEWS_DATABASE` — same server, different default DB, and
DB names are validated against `/^[A-Za-z0-9_]+$/` so env can't smuggle SQL).
`query-sales-sql.ts` is the reference implementation; defense layers, in
order:

1. **Statement validation** (`validateReadOnlySalesSql`): trim trailing `;`,
   reject multi-statement, must start `SELECT`/`WITH`, regex-reject forbidden
   verbs + table functions + `settings` (so the model can't relax limits) and
   `system.`/`information_schema.` references. Rejections return
   `{ok:false, error}` — the error text is written _for the model_ to
   self-correct on.
2. **Fail-closed brand scope** (brand-scoped tools only): the tool reads
   `context.requestContext.get(BRAND_SCOPE_RUNTIME_KEY)`; `undefined` (scope
   never published) and `[]` (no assigned brands) both refuse to run.
   `validateBrandScope` extracts single-quoted string literals, rejects any
   literal matching a _known_ brand code (cached
   `SELECT DISTINCT lower(brand)`, 10-min TTL) outside the allowed set, and
   requires at least one allowed-brand literal to be present. Explicitly a
   heuristic, not a SQL parser — instructions + `readonly` + this cover the
   realistic leak vectors.
3. **Server-side enforcement**: dedicated `@clickhouse/client` with
   `readonly: "2"` (writes/DDL/KILL blocked by ClickHouse itself),
   `max_execution_time: 15`, `max_result_rows: 10000` + overflow `throw`.
4. **Row cap by wrapping**: `SELECT * FROM (<sql>) AS agent_query LIMIT 201`,
   return ≤200 rows plus a `truncated` flag.
5. **Type-aware numification**: query with `format: "JSON"` (not JSONEachRow)
   to get `meta[].type`; convert string-encoded numerics
   (Int/Float/Decimal) to JS numbers for the model, leave strings alone.

Result shape: `{ok:true, rowCount, truncated, rows} | {ok:false, error}`.
Clients (pg/clickhouse) are `globalThis`-cached. Credentials embedded in
`CLICKHOUSE_URL` are hoisted into explicit options (`resolveCredentials`) to
avoid client warnings.

### 8.2 Shared tools (`tools/shared.ts`)

```ts
export const sharedTools = { generateExcel }; // spread into every agent's tools map
```

Mastra has no instance-level toolset; this barrel is the convention. **The map
key doubles as the model-facing tool name AND the UI stream part type**
(`tool-generateExcel`) — renaming the key breaks the rendering branches in
both Svelte components.

### 8.3 generateExcel (`tools/generate-excel.ts`)

Turns tabular data the model already has into a downloadable `.xlsx`:

- Input schema: `filename`, `sheets[] {name, columns[], rows[][]}` (cells
  `string|number|boolean|null`), optional `extraCommands[]` (officecli batch
  items for formatting/formulas/charts — the `excel-generation` skill is the
  command reference).
- Limits: 5 sheets, 50 columns, 5 000 rows/sheet, 20 000 total cells,
  200 extra commands, 25 MB output.
- Implementation: shells out to the `officecli` binary (`OFFICECLI_PATH` env,
  default resolves via PATH): `create` an xlsx in a temp dir, write one JSON
  batch of `set` commands (headers bold on row 1, data as literal values —
  a leading `=` gets space-prefixed so the CLI can't auto-convert data to
  formulas), run `batch --stop-on-error`, `close` the resident process to
  release the file lock, read with EBUSY/EPERM retry (Windows antivirus).
  `extraCommands` are vetted against an allowlist
  (`set|add|remove|move|swap|merge`, paths must start with `/`).
- Output: bytes go to the object store under
  `ai-exports/<uuid>/<filename>`; returns
  `{ok:true, fileId, filename, downloadUrl:"/api/ai/files/<uuid>/<filename>", rowCount, sheetCount}`
  or `{ok:false, error}` (errors are returned, not thrown, so the model can
  react).
- Download endpoint `GET /api/ai/files/[id]/[filename]`: any authenticated
  user with the link (the unguessable UUID is the capability); validates
  UUID + filename patterns, streams with `content-disposition: attachment`.
- Object store: Supabase Storage when `SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_STORAGE_BUCKET` are set, else local
  filesystem under `UPLOADS_DIR` (default `./uploads`).

## 9. The UI

Two components share the same internals (transport, session handling,
message rendering); they differ only in chrome.

### 9.1 Shared mechanics (both components)

```ts
import { Chat } from "@ai-sdk/svelte";
import { DefaultChatTransport } from "ai";

let sessionKey = $state<string>(crypto.randomUUID());
const chat = new Chat({
  transport: new DefaultChatTransport({ api: "/api/ai/chat" }),
});

// send — extras ride along per request so they're read at send time (reactive):
chat.sendMessage({ text }, { body: { agentId, sessionKey } });
```

- `busy = $derived(chat.status === "submitted" || chat.status === "streaming")`;
  the send button and history/new-chat actions are disabled while busy.
- **New chat**: `sessionKey = crypto.randomUUID(); chat.messages = []`. Purely
  client-side; the old thread stays in the DB.
- **Load a session**: `GET /api/ai/chat?agentId=...&session=<key>` → assign
  the returned UIMessage array directly to `chat.messages` and set
  `sessionKey = key`. Best-effort error handling (keep current conversation
  on failure).
- **Session list**: `GET /api/ai/chat?agentId=...` → `{sessions}` rendered as
  buttons (title + `toLocaleString()` timestamp), current one highlighted
  (`bg-accent`), sorted newest-first by the server.
- **Composer**: shadcn `Textarea`, `rows={1}`, autogrown via an `$effect`
  setting `style.height = min(scrollHeight, cap)` (cap 160px widget / 200px
  page); Enter sends, Shift+Enter newlines (keydown handler calling
  `preventDefault` + submit).
- **Autoscroll**: an `$effect` reading `chat.messages.at(-1)?.parts.length`
  and `chat.status` sets `scrollContainer.scrollTop = scrollHeight` — fires on
  every streamed part.
- **Status states**: `chat.status === "submitted"` → pulsing "Thinking…";
  `"error"` → destructive-colored message with `chat.error?.message`.

### 9.2 Message-part rendering (the `{#each}` over `chat.messages`)

Per message, keyed `message.id ?? messageIndex`:

- `role === "user"` → right-aligned `bg-primary` bubble, `max-w-[85%]`,
  `whitespace-pre-wrap`, concatenating `part.type === "text"` parts as plain
  text.
- `role === "assistant"` → stacked parts:
  - `text` → `{@html renderMarkdown(part.text)}` inside a Tailwind
    typography wrapper
    (`prose prose-sm dark:prose-invert prose-p:my-1.5 prose-table:my-2 ... max-w-none`).
    `renderMarkdown` = `marked` (`gfm: true, breaks: true`) piped through
    `DOMPurify.sanitize`; the non-browser branch just HTML-escapes (DOMPurify
    needs a DOM, and chat only exists client-side).
  - `part.type === "tool-generateExcel"` (constant `EXCEL_TOOL_PART_TYPE`) →
    three states via `excel-tool.ts` helpers: `state === "output-available"`
    with `output.ok` → an `<a download>` pill with a spreadsheet icon and the
    filename pointing at `output.downloadUrl`; error (`output.ok === false`
    or `state === "output-error"` / `errorText`) → small destructive text;
    otherwise → pulsing "Generating Excel…".
  - any other `tool-*` or `dynamic-tool` part → a muted one-liner
    "Queried the database" with a DB icon (tool inputs/outputs are
    deliberately not shown).
- Empty conversation → greeting text (widget) or a centered hero with icon +
  title + greeting (page).

### 9.3 `chat-widget.svelte` — floating per-section widget

Props: `{ agentId, title?, greeting?, placeholder? }`. Mounted at the end of
a section page, e.g.
`<ChatWidget agentId="invoices-agent" title="Invoices Assistant" greeting="…" />`.

- Everything is wrapped in bits-ui `<Portal>` to `<body>` — pages with
  `isolate`/stacking-context wrappers would otherwise paint the widget under
  the sidebar/topnav.
- Launcher: fixed round button bottom-right (`fixed right-6 bottom-6 z-50
size-12 rounded-full`) with a Sparkles icon; toggles `open`.
- Panel: `Card.Root`, `fixed right-6 bottom-24 z-50`,
  `max-h-[calc(100dvh-8rem)] max-w-[calc(100vw-3rem)]`, flex column with
  three regions — header bar, scrollable message area
  (`flex-1 overflow-y-auto overscroll-contain`), composer form (`border-t`).
- **Maximize**: `maximized = $state(false)`; class swap
  `maximized ? "h-[calc(100dvh-8rem)] w-[90vw]" : "h-[36rem] w-[26rem]"`,
  toggled by a header icon button switching Maximize2/Minimize2 icons.
- **History**: header History icon opens a `Popover` (`w-72`, scrollable
  `max-h-64` list). Titles are AI-generated shortly after the first exchange,
  so an `$effect` refetches the list every time the popover opens.
- **New chat**: SquarePen icon button (see §9.1); **Close**: X icon sets
  `open = false`.
- **Resume on first open**: a one-shot `$effect` (guarded by a plain
  `historyRequested` flag) fetches sessions and, if any exist, loads the most
  recent one — reopening the widget continues where the user left off.
- **Body scroll lock**: while `open`, an `$effect` sets
  `document.body.style.overflow = "hidden"` and restores the previous value
  in its cleanup.

### 9.4 `chat-page.svelte` — full-page chat (`/sales/chat`)

Same props; mounted as the entire page:

```svelte
<ChatPage
  agentId="sales-agent"
  title="Sales Assistant"
  greeting="…"
  placeholder="…"
/>
```

- Layout: `h-[calc(100svh-3.5rem)] overflow-hidden` flex row filling the
  viewport below the sticky `h-14` top nav — all scrolling happens inside the
  conversation column.
- Desktop (`md:`): left sidebar (`w-64 bg-muted/30 border-r`) with a
  full-width "New chat" outline button on top and the session list as a
  scrollable `<nav>`; sessions load on mount (`$effect` → `fetchSessions()`).
- Mobile (`md:hidden` header): title + History popover + New-chat button —
  the widget's header pattern.
- Conversation column: messages centered in `mx-auto max-w-3xl`, composer in
  a matching centered `max-w-3xl` form under a `border-t`.
- Title refresh: a `wasBusy` edge-detector `$effect` refetches the session
  list once each response finishes streaming (that's when the AI title for a
  new thread appears).
- `loadSession` short-circuits when `key === sessionKey`.

## 10. App wiring checklist

Everything needed to hook the system into a host app:

1. **Auth guards.** The endpoint relies on host helpers:
   `requireAuthenticatedApiUser(event)` (throws 401),
   `requireApiPermission(event, perms)`, `getAuthenticatedUserRole(event)` —
   here backed by better-auth sessions resolved in `hooks.server.ts`. Port or
   substitute your equivalents; the chat API must be able to get
   `{ user: { id } }` and a role.
2. **Brand scoping data** (optional feature): `listBrandsForUser(userId)` /
   `listBrands({active:true})` services. Drop `brandScoped` from the registry
   if the concept doesn't exist.
3. **Mount points.** Floating widget on section pages
   (`competition`, `offers-data-quality`, `aggregator-offers/invoices`,
   `google-reviews`); full page at `sales/chat/+page.svelte`. Page-level
   route guards should mirror each agent's registry permission.
4. **Env vars.**
   - `DATABASE_URL` — Postgres; Mastra auto-creates the `mastra` schema.
   - `OPENAI_API_KEY`, `AI_CHAT_MODEL` (e.g. `openai/gpt-4o`).
   - `CLICKHOUSE_URL` / `_USERNAME` / `_PASSWORD` / `_DATABASE` — optional:
     observability storage + the ClickHouse-backed tools;
     `CLICKHOUSE_SALES_DATABASE`, `CLICKHOUSE_COMPETITION_DATABASE`,
     `CLICKHOUSE_GOOGLE_REVIEWS_DATABASE` for per-domain tool databases.
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_STORAGE_BUCKET`
     or `UPLOADS_DIR` — Excel export storage.
   - `OFFICECLI_PATH` — officecli binary for Excel generation.
   - `MASTRA_WORKSPACE_DIR` — set in deployments where the built app's cwd
     doesn't contain `src/lib/server/mastra/workspace`.
5. **Scripts.** `"mastra:dev": "mastra dev --dir src/lib/server/mastra/dev --env .env"`
   (playground on port 4123; to test brand-scoped agents there, set
   `allowedBrandAliases` in the playground's runtime-context panel).
6. **Prisma views migration** (only if you want admin/analytics reads):
   replicate the `CREATE SCHEMA/TABLE IF NOT EXISTS` + `CREATE VIEW`
   migration and the two `view` blocks in `schema.prisma` (`previewFeatures =
["views"]`).
7. **Adding a new section assistant** (the repeatable recipe):
   1. `tools/query-<domain>-sql.ts` — copy a query tool, point it at the data
      source, adjust the forbidden-pattern list for the SQL dialect.
   2. `workspace/skills/<domain>-sql/SKILL.md` — schema + vetted queries.
   3. `agents/<domain>-agent.ts` — instructions (§5 structure),
      `tools: { ...sharedTools, query<Domain>Sql }`, `memory: () => getChatMemory()`.
   4. Register in `createMastra().agents` and in `chatAgents` with its
      permission.
   5. Mount `<ChatWidget agentId="<domain>-agent" ... />` on the section page.
   6. Restart the dev server (the `globalThis` cache ignores HMR).
8. **Adding a new export tool** — the recipe was exercised twice: `generateExcel`
   and `generateThreeJsReport` (interactive 3D chart HTML, three.js embedded
   via base64 importmap so the download works offline). Clone the tool under
   `tools/`, register in `tools/shared.ts` (key = UI part type), add the
   extension to the files route (HTML gets `inline` + a sandboxing CSP,
   `?download=1` forces attachment), add a client helper beside
   `ai-chat/excel-tool.ts`, branch all three renderers, add an agent
   instruction section and a `workspace/skills/<name>/SKILL.md`.

## 11. Gotchas worth knowing before you hit them

- **v6 everywhere.** `handleChatStream({version:"v6"})` and every
  `toAISdkMessages(..., {version:"v6"})` must agree with the installed
  `ai`/`@ai-sdk/svelte` majors, or parts silently fail to render.
- **No eager Mastra.** Constructing Mastra/Memory/Agent memory at module
  scope breaks `vite build` (no env in the builder stage). Everything is a
  lazy function cached on `globalThis`.
- **HMR blind spot.** Because of the `globalThis` caches, edits under
  `src/lib/server/mastra/` need a dev-server restart to take effect.
- **Tool key = part type.** The `sharedTools` map key becomes
  `tool-<key>` in the UI stream; UI branches match on that literal string.
- **The `.env`-wins env cascade** in `mastra/env.ts` is intentional (stale
  machine-level vars must not shadow project config); keep it when porting.
- **Titles arrive late.** Thread titles are generated asynchronously after
  the first exchange — both UIs refetch the session list at the right moments
  (popover open / stream end) instead of assuming the title exists.
- **Session keys are client-minted UUIDs** and validated with `z.uuid()`;
  the server namespaces them, so collisions/forgeries can only address the
  caller's own threads.
- **Excel data cells are always literals** — the leading-`=` space-prefix in
  `toLiteralCellValue` is a deliberate formula-injection guard; formulas are
  only possible through the vetted `extraCommands` path.
