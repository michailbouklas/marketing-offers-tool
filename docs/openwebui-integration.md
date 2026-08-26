# Open WebUI integration

Lets an external [Open WebUI](https://openwebui.com) instance talk to the
internal Mastra `sales-agent` (see `docs/ai-agent-system.md`). Two shapes are
exposed, sharing one auth module and the same brand-scoped agent invocation:

| Shape                                                                                              | Where it is added in Open WebUI                                                                | Who calls us                                  | Streaming                                                                |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| **A. OpenAI-compatible model** — `/api/openai/v1/models`, `/api/openai/v1/chat/completions`        | Admin Settings → **Connections** → OpenAI API. The agent appears as model `sales-agent`.       | Open WebUI backend                            | Yes — OpenAI SSE `chat.completion.chunk` frames                          |
| **B. OpenAPI tool server** — `/api/openwebui-tools/openapi.json`, `/api/openwebui-tools/ask-sales` | Settings → **Integrations** → Tools (per user) or Admin Settings → **External Tools** (global) | User's browser (per user) or backend (global) | No — the tool returns the whole answer; Open WebUI's own model relays it |

Shape A gives the best experience (our agent reasons and streams directly).
Shape B is for teams that want the sales data as a _tool_ next to another
model, and it is the one reachable from a non-admin user's Settings menu.

## Files

| File                                    | Purpose                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/lib/server/external-auth.ts`       | Bearer auth (shared secret or per-user token) → app user → permission → brand scope           |
| `src/lib/server/external-auth-token.ts` | HMAC per-user token sign/verify (no app imports; used by `scripts/openwebui-token.ts`)        |
| `src/lib/server/external-api-error.ts`  | `ExternalApiError` + OpenAI-style `{ error: { message, type, code } }` serializer             |
| `src/lib/server/brand-scope.server.ts`  | `buildBrandScopeRequestContext` — shared with the in-app chat route                           |
| `src/lib/server/openai-compat.ts`       | Request schema, message normalisation, SSE / JSON encoders                                    |
| `src/lib/server/cors.ts`                | Route-local CORS (`corsHeaders`, `preflight`, `withCors`) for the browser-invoked tool server |
| `src/routes/api/openai/v1/**`           | Shape A                                                                                       |
| `src/routes/api/openwebui-tools/**`     | Shape B                                                                                       |
| `scripts/openwebui-token.ts`            | Mint a per-user token                                                                         |

## Authentication

Every request carries `Authorization: Bearer <token>`. Two modes:

- **Shared secret** — `<token>` equals `OPENWEBUI_SHARED_SECRET`. The acting
  user is named by the forwarded email header (`OPENWEBUI_USER_EMAIL_HEADER`,
  default `x-openwebui-user-email`). Used by the model connection (A) and by
  global tool servers (B, admin-registered), where Open WebUI's backend can
  attach headers. Missing header → `401 missing_user_header`.
- **Per-user token** — `owui1_<base64url(email)>.<base64url(HMAC-SHA256(secret, "owui1:" + email))>`,
  minted with `bun scripts/openwebui-token.ts --email <user>`. Used by
  user-level tool servers (B, Settings → Integrations), which the browser
  calls directly and cannot attach a trusted email header to. Any email header
  is **ignored** in this mode, so a browser caller can never act as someone
  else.

Both modes then: look up the app user by email (case-insensitive), reject
banned users, require the `sales: ["view"]` permission (`403`), and build the
brand scope server-side exactly like `/api/ai/chat` does (admin/superUser →
all active brands, otherwise the user's assignments). The scope is published
into the Mastra `RequestContext`; `query-sales-sql.ts` fails closed without
it. A user with no brands gets a polite "no data available" answer, not an
error.

Open WebUI users must therefore exist in the marketing tool **with the same
email** and a role that grants `sales:view` (`analyticsViewer`, `admin`,
`superUser`).

### Token revocation

Per-user tokens are not stored. Revoke one user by banning/deleting them (the
auth module re-checks the user on every call); revoke all by rotating
`OPENWEBUI_SHARED_SECRET` (this also invalidates the model connection key).
If individual revocation without rotation becomes a requirement, add an
additive `api_token` table (or the better-auth `apiKey` plugin) — the auth
module is the single place to extend.

## Environment variables

```
OPENWEBUI_SHARED_SECRET=""              # empty = bridge disabled (503 on every route)
OPENWEBUI_USER_EMAIL_HEADER="x-openwebui-user-email"
OPENWEBUI_CHAT_ID_HEADER="x-openwebui-chat-id"
OPENWEBUI_TASK_HEADER="x-openwebui-task"
OPENWEBUI_ORIGIN=""                     # CSV of Open WebUI origins allowed for browser calls (CORS); empty = none
OPENWEBUI_ASK_TIMEOUT_MS="90000"        # tool-server budget per question
PUBLIC_BASE_URL=""                      # optional; OpenAPI servers[].url (defaults to ORIGIN)
```

## Shape A — OpenAI-compatible model connection

**Open WebUI**

1. Make sure the headers reach us. Either set
   `ENABLE_FORWARD_USER_INFO_HEADERS=True` on the Open WebUI container (sends
   `X-OpenWebUI-User-Email`, `-Chat-Id`, `-Task`, …), or add per-connection
   custom headers in step 2:
   `{"x-openwebui-user-email":"{{USER_EMAIL}}","x-openwebui-chat-id":"{{CHAT_ID}}","x-openwebui-task":"{{TASK}}"}`.
2. Admin Settings → Connections → **+** (OpenAI API): URL
   `https://<app-host>/api/openai/v1`, key = `OPENWEBUI_SHARED_SECRET`. The
   connection check calls `GET /models`; if it fails, add `sales-agent` to the
   model-ID allowlist manually.
3. Optional but recommended: Admin Settings → Interface → set a dedicated
   _task model_ so chat titles/tags never hit the bridge at all.

**Behaviour**

- `POST /chat/completions` accepts the standard body (`model`, `messages`,
  `stream`, …). Content-part arrays are flattened to text; **system messages
  are dropped** (an external client must not override the agent's
  instructions or brand scope); the last message must be from the user.
- Streaming emits `chat.completion.chunk` frames (`data: …\n\n`, then
  `data: [DONE]`). While the SQL tool runs, one italic status line
  (`_Querying sales data…_`) is streamed so the bubble is never blank. The
  final chunk carries `finish_reason` and `usage`.
- **Memory.** When the chat-id header is present, one Mastra thread per Open
  WebUI chat is used (`openwebui:<userId>:<chatId>`, resource = userId) and
  only the newest user turn is sent (Open WebUI resends the full history;
  with memory on, sending it too would duplicate every turn). Without the
  header the call is stateless: full history in, nothing persisted. The
  `openwebui:` prefix keeps these threads out of the in-app widget's list.
- **Background tasks.** Open WebUI also asks the selected model for chat
  titles, tags, follow-ups, etc. When the task header is set, the request is
  answered by `openai/gpt-4o-mini` with tools disabled and no memory — zero
  SQL, negligible cost.
- **No file exports.** `generateExcel` / `generateThreeJsReport` are removed
  from the active tool set (`activeTools`) and the agent's instructions gain a
  channel section explaining that exports are only available in the in-app
  Sales Chat. Open WebUI users could not open the app's session-gated
  download links anyway.

## Shape B — OpenAPI tool server

`GET /api/openwebui-tools/openapi.json` publishes one operation,
`askSalesAssistant` = `POST /api/openwebui-tools/ask-sales` with body
`{ question, conversation_context? }` and response
`{ answer, brands_in_scope }`. The operation description is written for the
LLM: when to use it, that answers are authoritative and already brand-scoped,
and not to recompute figures. The call runs `agent.generate` with
`maxSteps: 8`, the SQL tool only, and an `OPENWEBUI_ASK_TIMEOUT_MS` budget
(`504 timeout` when exceeded).

**Per user (Settings → Integrations → Tools)**

1. Mint a token: `bun scripts/openwebui-token.ts --email user@phc.cy`.
2. In Open WebUI: Settings → Integrations → Tools → **+**: URL
   `https://<app-host>/api/openwebui-tools`, OpenAPI spec path
   `openapi.json`, Auth **Bearer**, key = the token.
3. Enable the tool in the chat input's **+** menu and ask a sales question.

Because the browser calls us directly: the app must be served over HTTPS
when Open WebUI is, and `OPENWEBUI_ORIGIN` must contain the Open WebUI origin
(the `OPTIONS` preflight answers 403 otherwise). Error responses carry the
CORS headers too, so a 401/403 shows its message instead of a blank network
error.

**Global (Admin Settings → External Tools)**

1. **+** → type **OpenAPI**, same URL and spec path, Auth **Bearer**, key =
   `OPENWEBUI_SHARED_SECRET`, headers
   `{"X-OpenWebUI-User-Email":"{{USER_EMAIL}}","X-OpenWebUI-Chat-Id":"{{CHAT_ID}}"}`
   (or rely on `ENABLE_FORWARD_USER_INFO_HEADERS=True`).
2. Raise Open WebUI's tool timeout: `AIOHTTP_CLIENT_TIMEOUT_TOOL_SERVER=120`
   (defaults can be as low as 10 s).

No CORS or HTTPS constraint applies — the Open WebUI backend makes the call.

## Reverse proxy notes

- SSE needs the proxy **not** to buffer: the routes send
  `X-Accel-Buffering: no` and `Cache-Control: no-cache, no-transform`; add
  `proxy_buffering off;` on the location if your nginx ignores the header.
- Set `proxy_read_timeout 120s;` (or higher) for `/api/openai/` and
  `/api/openwebui-tools/` — SQL-backed answers can take 10–60 s.
- WebSocket `Upgrade` / `Connection "upgrade"` headers are **not** required;
  the bridge uses plain HTTP + SSE.
- Keep the runtime on `node build/index.js` (see `Dockerfile`): bun's
  `node:http` shim tears down streamed responses.

## Troubleshooting

| Symptom                                                       | Cause / fix                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `503 not_configured`                                          | `OPENWEBUI_SHARED_SECRET` is empty on the app                                                                |
| `401 missing_user_header`                                     | Shared-secret mode without the email header — enable header forwarding or the custom `{{USER_EMAIL}}` header |
| `401 invalid_api_key`                                         | Key is neither the secret nor a valid token (rotated secret? typo?)                                          |
| `403 unknown_user` / `insufficient_permissions`               | Open WebUI email has no matching app user, or the user lacks `sales:view`                                    |
| Browser console shows a CORS / opaque error (user-level tool) | Open WebUI origin missing from `OPENWEBUI_ORIGIN`, or mixed content (app on HTTP behind an HTTPS Open WebUI) |
| Every new chat runs a SQL query for the title                 | Task header is not being forwarded — add `{{TASK}}` custom header or set a dedicated task model              |
| Tool call times out in Open WebUI                             | Raise `AIOHTTP_CLIENT_TIMEOUT_TOOL_SERVER`; narrow the question; check `OPENWEBUI_ASK_TIMEOUT_MS`            |

## Smoke tests

```bash
B=http://localhost:5173; S=$OPENWEBUI_SHARED_SECRET; E=you@phc.cy
curl -s -H "Authorization: Bearer $S" $B/api/openai/v1/models
curl -N -X POST $B/api/openai/v1/chat/completions -H "Authorization: Bearer $S" \
  -H "x-openwebui-user-email: $E" -H "x-openwebui-chat-id: smoke-1" -H "Content-Type: application/json" \
  -d '{"model":"sales-agent","stream":true,"messages":[{"role":"user","content":"Which are my brands?"}]}'
curl -s $B/api/openwebui-tools/openapi.json | head -c 400
TOKEN=$(bun scripts/openwebui-token.ts --email $E | sed -n 3p)
curl -s -X POST $B/api/openwebui-tools/ask-sales -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"question":"Which are my brands?"}'
```
