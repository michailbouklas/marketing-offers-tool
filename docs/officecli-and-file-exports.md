# officecli + AI File Exports (Excel generation, storage, download)

Companion to `docs/ai-agent-system.md` (§8.2–8.3 there is the summary; this is
the full detail). Covers three things:

1. How the `officecli` binary is installed in the Docker image.
2. The Excel generation capability on Mastra — the `generateExcel` tool + the
   `excel-generation` skill — and how a Word equivalent would slot in
   (**Word generation is NOT currently implemented**; see §3.4).
3. How generated files are persisted (object store) and served back to the
   user (capability-URL download endpoint + UI rendering).

---

## 1. officecli in the Dockerfile

`officecli` is [iOfficeAI/OfficeCLI](https://github.com/iOfficeAI/OfficeCLI) —
a standalone native binary (no Office/LibreOffice install needed) that
creates and edits Office documents through a JSON command interface. The app
uses it only server-side, shelled out from the `generateExcel` Mastra tool.

The `Dockerfile` (bun-based, multi-stage: `base` → `install` / `officecli` /
`builder` → `runner`) installs it in a **dedicated stage** so the download,
checksum tooling, and curl never reach the final image:

```dockerfile
FROM base AS officecli
ARG OFFICECLI_VERSION=v1.0.140
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates libicu76 \
    && rm -rf /var/lib/apt/lists/* \
    && case "$(dpkg --print-architecture)" in \
         amd64) ASSET=officecli-linux-x64 ;; \
         arm64) ASSET=officecli-linux-arm64 ;; \
         *) echo "unsupported architecture" >&2; exit 1 ;; \
       esac \
    && cd /tmp \
    && curl -fsSLO "https://github.com/iOfficeAI/OfficeCLI/releases/download/${OFFICECLI_VERSION}/${ASSET}" \
    && curl -fsSLO "https://github.com/iOfficeAI/OfficeCLI/releases/download/${OFFICECLI_VERSION}/SHA256SUMS" \
    && grep "${ASSET}\$" SHA256SUMS | sha256sum -c - \
    && install -m 0755 "${ASSET}" /usr/local/bin/officecli \
    && rm -f "/tmp/${ASSET}" /tmp/SHA256SUMS \
    && officecli --version
```

Design points to preserve when reproducing:

- **Version pinned via `ARG OFFICECLI_VERSION`** (currently `v1.0.140`) —
  bump deliberately, not implicitly. The tool code depends on ≥1.0.140
  behavior in two places: the batch failure report echoes back the failing
  `item`, and 1.0.73+ auto-converts `=`-prefixed values into formulas (which
  the tool defends against, see §2.3).
- **Arch-aware asset selection** (`dpkg --print-architecture` →
  `officecli-linux-x64` / `officecli-linux-arm64`) so the same Dockerfile
  builds on x64 CI and ARM dev machines.
- **SHA256 verification against the release's `SHA256SUMS`** before
  installing — a failed checksum fails the build.
- **`libicu76`** is officecli's one runtime dependency (it's a .NET
  single-file binary needing ICU). It must be installed in **both** the
  `officecli` stage (so `officecli --version` can run as a smoke test) and
  the `runner` stage. On a different Debian base the package name changes
  (`libicu72` on bookworm, etc.) — match your base image.
- `officecli --version` at the end of the stage is the build-time smoke test:
  a broken/mislinked binary fails the image build, not the first user export.

The final stage copies just the binary:

```dockerfile
FROM base AS runner
...
RUN apt-get update \
    && apt-get install -y --no-install-recommends libicu76 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=officecli /usr/local/bin/officecli /usr/local/bin/officecli
```

At runtime the tool resolves the binary via `getOfficeCliPath()`
(`src/lib/server/mastra/env.ts:127`): `OFFICECLI_PATH` env var, defaulting to
`officecli` on `PATH` — which `/usr/local/bin/officecli` satisfies in the
container. On Windows dev machines set
`OFFICECLI_PATH=C:\path\to\officecli.exe` in `.env` (or put it on PATH).

## 2. Excel generation on Mastra

The capability has two halves that must stay in sync:

- **The tool** — `generateExcel` (`src/lib/server/mastra/tools/generate-excel.ts`),
  in every agent's tool map via the `sharedTools` barrel
  (`tools/shared.ts`). The map key `generateExcel` is simultaneously the
  model-facing tool name and the UI stream part type `tool-generateExcel`.
- **The skill** — `workspace/skills/excel-generation/SKILL.md`, loaded on
  demand through the Mastra Workspace. The tool handles the common case
  (plain data + bold headers) without the skill; the skill is the reference
  for _advanced_ output via `extraCommands`.

### 2.1 Division of labor: tool description vs skill vs agent instructions

This three-layer split keeps the per-request prompt small and is the pattern
to copy for any officecli-backed capability:

1. **Tool `description` + zod `inputSchema` `.describe()`s** carry just
   enough for the model to make a plain export correctly: pass `filename` +
   `sheets[{name, columns, rows}]`, headers bold automatically, never invent
   the download URL, load the skill before using `extraCommands`.
2. **Every agent's instructions** contain a short "Excel export" section
   (identical across the five agents): trigger phrases ("save this as
   excel"), re-run the query if the data left the context, use a descriptive
   filename, load the `excel-generation` skill for styling, and after success
   only _confirm_ — the chat UI renders the download button itself, so the
   model must not repeat the link.
3. **The `excel-generation` skill** is the deep reference the model pulls in
   only when needed: when/when-not to call the tool, the limits, and the full
   officecli batch-item vocabulary — cell props (`value`, `formula` without
   the leading `=`, `numberformat`, `bold`/`italic`, `font.color`, `fill`),
   recipes for total rows, currency column formatting, freeze panes +
   autofilter, sorting, column widths (must use the `A:A` range form — a bare
   `/Sheet/A` fails with "Element not found"), anchored charts
   (`{"command":"add","type":"chart","props":{"anchor":"6,1,8,15","type":"bar","source":"A1:B10"}}`),
   and merges. It also carries failure policy: on `{ok:false}` fix the
   offending item and retry once; if it keeps failing, drop `extraCommands`
   and deliver the plain export rather than nothing.

### 2.2 Tool input contract

```ts
inputSchema: z.object({
  filename: z.string(), // sanitized server-side; forced .xlsx suffix
  sheets: z
    .array(
      z.object({
        name: z.string(), // Excel sheet-name rules enforced server-side
        columns: z.array(z.string()).min(1).max(50),
        rows: z.array(
          z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
        ),
      }),
    )
    .min(1)
    .max(5),
  extraCommands: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
});
```

Hard limits (checked before any I/O; violations return `{ok:false, error}`
with a message telling the model to aggregate/narrow): 5 sheets, 50 columns,
5 000 rows/sheet, **20 000 total cells**, 200 extra commands, 25 MB output
file. Timeouts: 15 s for `create`/`close`, 60 s for the `batch` run.

### 2.3 Execution pipeline (`generateExcelFile`)

1. **Vet `extraCommands`** against an allowlist —
   `set | add | remove | move | swap | merge`, every item needs a `path`
   starting with `/`. `dump`, `proofread`, and any future shell-ish commands
   are rejected up front.
2. **Sanitize names.** Filename → `[A-Za-z0-9 ._()-]`, ≤96 chars, forced
   `.xlsx` (must stay in lockstep with the download route's
   `FILENAME_PATTERN`, §4.2). Sheet names → strip `[]:*?/\`, ≤31 chars,
   dedupe with ` (n)` suffixes.
3. **Compile the workbook to one JSON batch** of officecli commands:
   - Sheet 1 is renamed from officecli's default `Sheet1` (or kept if the
     name matches); further sheets are `add` commands.
   - Header row: one `set` per header cell with `bold: "true"`.
   - Data cells: one `set` per non-empty cell, always as **literal values**
     via `toLiteralCellValue` — booleans become `"TRUE"/"FALSE"`, and any
     string starting with `=` gets a leading space (invisible in Excel) so
     officecli cannot auto-promote model-supplied data into a live formula.
     **This is the formula-injection guard**; real formulas exist only through
     vetted `extraCommands` (`props.formula`, no `=` prefix).
   - Vetted `extraCommands` are appended after the data, same atomic batch.
4. **Run officecli** in a `mkdtemp` work dir:
   `create out.xlsx --json` → write `batch.json` →
   `batch out.xlsx --input batch.json --json --stop-on-error`.
   Two portability quirks are handled explicitly:
   - A failed batch exits non-zero but still prints its per-command JSON
     report on stdout — the catch recovers `error.stdout` so the _failing
     command_ is reported to the model instead of Node's generic "Command
     failed".
   - officecli keeps a **resident process** holding the document open for
     fast follow-ups; `closeResident()` (`officecli close <file> --json`,
     best-effort) must run before reading/deleting the xlsx, including in the
     `finally` block.
   - Env: `OFFICECLI_BATCH_ALLOW_STDIN_REDIRECT=1` silences the
     redirected-stdin warning; `windowsHide: true`; `maxBuffer` 16 MB.
5. **Parse the batch report.** Failure if `success === false`, any
   `results[].success === false`, or `summary.failed > 0`. The error message
   sent back to the model includes the failing command (echoed `item`) and,
   when `summary.atomicRolledBack` is set, tells it the whole batch rolled
   back so it should fix and retry the _full_ export.
6. **Read the file with EBUSY/EPERM retry** (5 attempts, 250ms·n backoff) —
   Windows antivirus briefly locks freshly written files.
7. **Persist + return** (see §3). Size-check against 25 MB first.

All failures are **returned** (`{ok:false, error}`), never thrown — Mastra
feeds the tool result back to the model, and the error strings are written as
instructions the model can act on (fix SQL, narrow data, fix a batch item).

## 3. How generated files are saved

### 3.1 Storage key

```ts
const fileId = randomUUID();
await getObjectStore().put(
  `ai-exports/${fileId}/${filename}`,
  bytes,
  XLSX_MIME,
);
```

Key layout `ai-exports/<uuid>/<sanitized-filename>.xlsx`:

- The random UUID makes every export write-once and collision-free (repeat
  exports never overwrite each other).
- The filename lives in the key so the download URL ends in a real
  `.../<filename>.xlsx` path segment — browsers and the `download` attribute
  get a sensible name without extra metadata storage.
- There is **no database record** of exports — the object store key is the
  whole registry. (Consequence: no TTL/cleanup exists yet; if you need
  retention, sweep the `ai-exports/` prefix.)

### 3.2 The ObjectStore abstraction

`ObjectStore` (`src/lib/server/object-store-core.ts`) is a small interface
(`put/get/tryGet/getText/putText/remove/copy/list`) with two drivers:

- **`SupabaseObjectStore`** — production. Supabase Storage bucket via
  `@supabase/supabase-js` (`upload` with `upsert: true` + `contentType`,
  `download` → `Buffer`). Client is `globalThis`-cached, created with
  `persistSession: false, autoRefreshToken: false` (service-role key, no auth
  state).
- **`LocalObjectStore`** — dev/test fallback. Keys map to files under a root
  dir (`UPLOADS_DIR`, default `./uploads`), directories `0o700`, files
  `0o600`.

Every key passes `assertSafeKey`: relative POSIX paths only — no leading
`/`, no backslashes, no `..` or empty/`.` segments. This is the traversal
guard for the local driver (keys become `join(rootDir, ...key.split("/"))`).

Driver selection: Supabase when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`

- `SUPABASE_STORAGE_BUCKET` are all set, else local. There are two
  env-wrapper modules around the same core — `object-store.server.ts` (SvelteKit
  `$env`, used by the download route) and `mastra/object-store.ts`
  (`mastra/env.ts`, used by the tool) — **both must resolve to the same
  backend**, since the tool writes and the route reads. The split exists only
  because code under `src/lib/server/mastra/` cannot import SvelteKit virtual
  modules (the `mastra dev` playground bundles it standalone).

### 3.3 Tool result → UI

```ts
return {
  ok: true,
  fileId,
  filename,
  downloadUrl: `/api/ai/files/${fileId}/${encodeURIComponent(filename)}`,
  rowCount,
  sheetCount,
};
```

The `downloadUrl` is a **relative app path** — no storage internals (bucket
names, signed URLs) ever reach the model or the client. The instructions
forbid the model to restate the URL because streaming it through the model
invites hallucinated/altered links; the UI renders the real one from the tool
part instead.

### 3.4 Word documents — current status and extension path

**There is no Word/docx generation in the codebase today.** No
`generateWord` tool, no `word-generation` skill, no docx handling anywhere
under `src/`. Only Excel is implemented.

officecli itself is format-agnostic (Word/PowerPoint use the same
`create`/`batch` JSON command surface with document-appropriate paths and
props), so a Word capability would be a straight clone of the Excel pattern:

1. `tools/generate-word.ts` — same skeleton as `generate-excel.ts`: input
   schema for the document content, compile to a batch, `create out.docx` →
   `batch` → `close` → size check → `put("ai-exports/<uuid>/<name>.docx")`,
   return `{ok, filename, downloadUrl}`.
2. Register it in `sharedTools` (`{ generateExcel, generateWord }`) — the key
   becomes UI part type `tool-generateWord`.
3. `workspace/skills/word-generation/SKILL.md` with the officecli Word
   command reference; a "Word export" section in agent instructions.
4. Extend the download route: the filename pattern and MIME are xlsx-only
   (§4.2) — either a second pattern+MIME branch keyed on extension, or a
   per-type route.
5. Extend the UI: a `WORD_TOOL_PART_TYPE` branch in both chat components
   (`chat-widget.svelte`, `chat-page.svelte`) and the admin conversation
   dialog, mirroring the excel three-state rendering (§5).

This extension path has since been exercised once (not for Word): the
`generateThreeJsReport` tool (`tools/generate-threejs-report.ts`) produces a
standalone interactive 3D chart HTML page (three.js + OrbitControls embedded
as base64 importmap entries, offline-capable) stored under the same
`ai-exports/<uuid>/<filename>` keys. The download route now accepts `.html`
alongside `.xlsx`: HTML is served `inline` with a sandboxing CSP
(`sandbox allow-scripts`, opaque origin — its scripts cannot make
credentialed same-origin requests) unless `?download=1` forces an
attachment. UI branches live behind `THREEJS_REPORT_TOOL_PART_TYPE` in
`ai-chat/threejs-report-tool.ts`; the deep model-facing reference is
`workspace/skills/threejs-reports/SKILL.md`.

## 4. How files are served to the user

### 4.1 Route

`GET /api/ai/files/[id]/[filename]`
(`src/routes/api/ai/files/[id]/[filename]/+server.ts`):

```ts
requireAuthenticatedApiUser(event); // any logged-in user
if (!UUID_PATTERN.test(id)) error(400); // strict UUID v-agnostic hex form
if (!FILENAME_PATTERN.test(filename)) error(400); // ^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,99}\.xlsx$
const bytes = await getObjectStore().tryGet(`ai-exports/${id}/${filename}`);
if (!bytes) error(404);
return new Response(new Uint8Array(bytes), {
  headers: {
    "content-type": XLSX_MIME,
    "content-length": String(bytes.length),
    "content-disposition": `attachment; filename="${filename}"`,
    "cache-control": "private, max-age=3600",
  },
});
```

### 4.2 Security model

- **Capability URL**: any authenticated user with the link may download; the
  unguessable UUID _is_ the authorization. There is deliberately no owner
  check (exports are shareable between colleagues in the same tool). If
  per-user ownership is needed on another system, store `userId` alongside
  the export and check it here.
- **Two-pattern validation replaces path handling**: the UUID and filename
  regexes are the only defense needed on top of `assertSafeKey`, because the
  key is reassembled from validated parts — never from raw request path. The
  route's `FILENAME_PATTERN` deliberately mirrors (is a superset of) the
  tool's `sanitizeFilename` output; **change them together**.
- `content-disposition: attachment` + exact `content-type` prevents inline
  rendering; `cache-control: private` keeps proxies from caching a
  user-fetched export.

### 4.3 UI rendering of the download

Both chat components branch on the stream part type
(`EXCEL_TOOL_PART_TYPE = "tool-generateExcel"`, helpers in
`src/lib/components/ai-chat/excel-tool.ts`). The AI SDK part lifecycle drives
three visual states:

| Part state                                           | Render                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| streaming / `input-available` (no output yet)        | pulsing "Generating Excel…" with spreadsheet icon                                                             |
| `output-available` + `output.ok`                     | `<a href={output.downloadUrl} download={output.filename}>` pill — icon + filename, `bg-muted hover:bg-accent` |
| `output-available` + `!output.ok`, or `output-error` | small destructive "Excel export failed: <error>"                                                              |

`GenerateExcelOutput` is **redeclared** in `excel-tool.ts` rather than
imported: the canonical type lives in a server-only module the browser bundle
must not touch. Keep the two shapes in sync manually.

Because Mastra persists tool parts in the thread, the download pill also
survives history recall — reopening an old conversation re-renders working
download links (as long as the object still exists in the store), and the
superUser `/admin/chat-usage` conversation dialog renders the same part type.

## 5. Reproduction checklist (delta on top of `ai-agent-system.md` §10)

1. Dockerfile: add the `officecli` stage (pin version, arch switch, SHA256
   check, `libicu*`), copy binary + install `libicu*` in the runner.
2. Env: `OFFICECLI_PATH` (only needed off-PATH, e.g. Windows dev),
   `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_STORAGE_BUCKET` or
   `UPLOADS_DIR`.
3. Copy `object-store-core.ts` + both env wrappers (or collapse to one if you
   don't need the `mastra dev` playground).
4. Copy `tools/generate-excel.ts`, register via `tools/shared.ts`.
5. Copy `workspace/skills/excel-generation/SKILL.md`; add the "Excel export"
   section to each agent's instructions.
6. Copy the download route; keep its filename pattern in sync with the tool's
   sanitizer.
7. Copy `excel-tool.ts` + the `EXCEL_TOOL_PART_TYPE` branches in the chat
   components.
8. Smoke test: ask an agent "export this as excel" → expect a `[generate-excel]
<file>: N row(s) ...` server log line, an object under `ai-exports/`, and a
   working download pill in the chat.
