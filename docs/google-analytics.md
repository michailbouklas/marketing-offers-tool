# Google Analytics dashboards

`/google-analytics` shows a Google Analytics 4 overview per brand (users,
sessions, engagement, key events, daily trend, and traffic by channel / page /
device / country). Data comes straight from the **Google Analytics Data API
(v1beta)**; nothing is copied into our databases except the property
configuration described below.

- Roles: `analyticsViewer`, `admin`, `superUser` (`googleAnalytics: ["view"]`
  in `src/lib/auth/permissions.ts`, `googleAnalyticsRoles` in `roles.ts`).
- Brand scope: **the user's own `user_brand` assignments, for every role** —
  admins and super users included. This deliberately differs from Sales Chat /
  Forecasts (`listScopedBrands`), where admins see every active brand. A super
  user with no assignments sees an empty state.
- Only brands with at least one _active_ GA4 property appear. A brand may own
  several properties; the page shows one at a time via a property switch.

## Setting up a brand

Step-by-step instructions for non-technical users (finding the property id,
creating the service account and key, granting access) are in
[`google-analytics-setup-guide.md`](./google-analytics-setup-guide.md). The
summary below is the technical version.

Per GA4 property (done once by an admin on `/admin/brands/[id]` →
**Google Analytics properties**):

1. In Google Cloud, create (or reuse) a service account and **enable the
   "Google Analytics Data API"** in that project. Download a JSON key.
2. In Google Analytics → Admin → Property access management, add the service
   account's `client_email` with the **Viewer** role on the property.
3. Find the numeric property id (Admin → Property settings; it is _not_ the
   `G-XXXX` measurement id).
4. On the brand page click **Add property**, give it a display name, paste the
   numeric id (or `properties/<id>`) and the JSON key (paste or choose the
   file), save, then click **Test connection**. A green "Verified" badge means
   both the key and the Viewer grant work; the error text otherwise is
   Google's own explanation.

Who may do this: admins and super users only (`requireApiAdminPermission` with
`brand: ["manage"]`). Brand managers can open the brand page but see the card
read-only.

## Credentials at rest

- Only the schema-validated subset of the key is stored (`type`,
  `client_email`, `private_key`, `private_key_id`, `token_uri`, `project_id`),
  encrypted with **AES-256-GCM** (`src/lib/server/google-analytics-crypto.server.ts`)
  in `brand_google_analytics_property.credentialsEncrypted` as
  `v1:<iv>:<tag>:<ciphertext>`.
- The key comes from `GOOGLE_ANALYTICS_CREDENTIALS_KEY` (32 bytes, base64 —
  `openssl rand -base64 32`). Unset ⇒ the admin card refuses to store
  credentials and existing properties cannot be queried.
- **No rotation in v1.** Changing the key makes every stored credential
  undecryptable; admins must re-upload the JSON keys (Edit → paste new key).
- The ciphertext never leaves the server. API responses and page data expose
  only `client_email` and the last 8 characters of `private_key_id`.

## How a dashboard loads

`src/lib/services/google-analytics/`

| File                        | Role                                                                                                                                                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `google-analytics.ts`       | Browser-safe types, URL filter helpers, the service-account Zod schema, formatters.                                                                                                                                                                                                                                                              |
| `properties.server.ts`      | Prisma CRUD for properties, credential (de)encryption, the viewer scope (`listGoogleAnalyticsBrandsForUser`, `resolveGoogleAnalyticsScope` — out-of-scope ⇒ 403).                                                                                                                                                                                |
| `ga4-client.server.ts`      | REST client: RS256 JWT assertion → OAuth token (cached per service account), `runReport`, `batchRunReports`, `verifyPropertyAccess`, error → user message.                                                                                                                                                                                       |
| `dashboard-reports.ts`      | Pure request builders and the response → `GoogleAnalyticsDashboard` mapper (unit-tested).                                                                                                                                                                                                                                                        |
| `report-cache.server.ts`    | Persistent cache: one raw GA4 report per (property row, range, report key) in `google_analytics_report_cache` (Postgres, survives restarts, shared by instances).                                                                                                                                                                                |
| `dashboard-fetch.server.ts` | The only place dashboard reports are fetched: ≤ 5 per `batchRunReports`, batches run sequentially, each batch persisted before the next; logs `returnPropertyQuota` remaining tokens; never throws (outcome carries the error + failed keys).                                                                                                    |
| `dashboard.server.ts`       | Assembles the dashboard widget by widget from the cache; fetches stale/missing reports; on 429/5xx serves the stale copy, marks widgets with no copy `pending` and enqueues a retry; non-retryable errors throw. One in-flight load per (property, range).                                                                                       |
| `refresh-queue.server.ts`   | Retry queue (`google_analytics_refresh_job`, one row per property + range): enqueue merges keys; the croner sweep (`GOOGLE_ANALYTICS_REFRESH_CRON`, every minute) retries with 5→10→20→40→60 min backoff, stops after the first 429 of a tick, gives up after `GOOGLE_ANALYTICS_REFRESH_MAX_AGE_HOURS`. Postgres advisory lock across processes. |

### Widgets and the reports behind them

Eleven standard reports per load, sent as three parallel `batchRunReports`
calls (Google caps a batch at five), flattened back into
`DASHBOARD_REPORT_ORDER` and mapped in `dashboard-reports.ts`:

| Widget                       | Dimensions                                   | Metrics                                                                                             | Notes                                                                     |
| ---------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| KPI tiles + daily trend      | `date` (+ auto `dateRange`)                  | activeUsers, newUsers, sessions, engagementRate, averageSessionDuration, keyEvents, screenPageViews | Two `dateRanges`; TOTAL row of range 0 = tiles, range 1 = period deltas   |
| Traffic channels             | `sessionDefaultChannelGroup`                 | sessions, activeUsers                                                                               | top 10                                                                    |
| Top pages & screens          | `unifiedScreenName`                          | sessions, activeUsers                                                                               | top 10; page title (web) or screen name (app) so app-only properties work |
| Devices / Countries / Cities | `deviceCategory` / `country` / `city`        | sessions, activeUsers                                                                               | top 10 each                                                               |
| Campaign performance         | `sessionSourceMedium`, `sessionCampaignName` | sessions, engagementRate, keyEvents                                                                 | top 15; engagement re-weighted by sessions when rows merge                |
| Landing pages                | `landingPage`                                | sessions, newUsers, userEngagementDuration, keyEvents                                               | avg engagement = duration ÷ sessions                                      |
| Hour × weekday heatmap       | `dayOfWeek`, `hour`                          | sessions                                                                                            | always 7 × 24 cells; GA `dayOfWeek` 0 = Sunday, UI shows Monday first     |
| New vs returning             | `newVsReturning`                             | activeUsers, sessions, engagementRate                                                               | CSS conic-gradient donut, fixed colour per segment                        |
| Key events by name           | `eventName`                                  | keyEvents                                                                                           | `metricFilter keyEvents > 0`, top 10                                      |

**Live now** is not part of the dashboard batch: `GET /api/google-analytics/realtime?brand=&property=`
runs three `runRealtimeReport` calls (total, `minutesAgo` series,
`unifiedScreenName` top pages) over the last 30 minutes. The browser polls
every 60 s while the tab is visible; the server shares one snapshot per
property for 30 s (`realtime.server.ts`). Scope is resolved with the same
helper as the page using `{ guard: "api" }` (403 JSON instead of redirect).

- Date ranges end **yesterday** (`NdaysAgo` → `yesterday`): GA4 reports today
  only partially, so "last 7 days" means the seven complete days before today.
  The comparison period is the equal-length window immediately before
  (`2N daysAgo` → `N+1 daysAgo`).
- Reports: daily `date` series with `metricAggregations: TOTAL` (the TOTAL row
  feeds the tiles so `activeUsers` is not over-counted by summing days), plus
  top-10 breakdowns by `sessionDefaultChannelGroup`, `unifiedScreenName`,
  `deviceCategory`, `country` ordered by sessions.
- Cache: every report is stored in Postgres (`google_analytics_report_cache`)
  and served without asking Google while younger than
  `GOOGLE_ANALYTICS_CACHE_TTL_MS` (default 6 h — dashboards end yesterday, so
  the data barely moves within a day). Only stale or missing reports are
  fetched, sequentially, ≤ 5 per batch. A key swap on a property purges its
  rows; admins / superUsers get a "Clear GA caches" button on the page
  (`?/clearCache` action: all rows, all queued retries, in-memory realtime and
  metadata caches). Only the 30 s realtime snapshot stays in memory.
- Quota: GA4 standard properties allow 14,000 Core tokens per project per
  property per hour (and 40,000 / hour, 200,000 / day per property); batching
  saves round-trips, not tokens. A full dashboard load costs ~14 tokens
  (measured 2026-10-16 on Pizza Hut). Each batch logs the remaining tokens
  (`[google-analytics] property row … tokens remaining: …`) so a 429 can be
  attributed. Core and Realtime are separate buckets: the live card cannot
  exhaust the dashboard's quota.
- When Google answers 429 / 5xx the page still renders: widgets with an older
  copy show it with an "updated … ago" note, widgets with no copy become a
  "Waiting for Google Analytics" card, and a refresh job is queued. While any
  widget is pending the page polls `GET /api/google-analytics/dashboard-status`
  every 30 s and reloads its data once the sweep has filled the gaps. A page
  load does not ask Google again for keys whose retry is already scheduled.
- The page load awaits only the permission check and brand/property scope;
  the Google call is returned as a streamed promise (`streamed.dashboard`), so
  the shell and controls render at once and skeletons show until GA answers.
  The streamed promise never rejects; errors arrive as `{ error }`.
- Breakdown rows with the same label (GA4 returns both `""` and `(not set)`)
  are merged in the mapper. Table rows are keyed by position: a duplicate
  key makes Svelte throw inside the resolved branch and the skeleton never
  clears.
- Failures (key rejected, no Viewer grant, quota, Google unreachable, missing
  encryption key) are shown inline on the page via
  `describeGoogleAnalyticsError`, so the user can still switch brand / period.

## Assistant

The page carries a chat widget backed by the Mastra agent
`google-analytics-agent` (`src/lib/server/mastra/agents/google-analytics-agent.ts`).
Unlike the Invoices Assistant it has no database of its own: every number
comes live from the GA4 Data API, so the agent composes report requests
instead of SQL.

| Piece                                                                      | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat-registry.ts` → `googleAnalyticsScoped`                               | The chat endpoint publishes the caller's **own** brand assignments that have an active GA4 property (`listGoogleAnalyticsBrandsForUser`, every role — admins too) under `GOOGLE_ANALYTICS_SCOPE_RUNTIME_KEY`. Deliberately not `brandScoped`, which would give admins every brand. The widget's `context` (brand, property, range) is validated against that scope and published as the page context.                                                                 |
| `tools/google-analytics-gateway.ts` + `google-analytics-gateway.server.ts` | Seam between the Mastra tools (which may not import Prisma / `$env`) and the GA4 services. Installed from `hooks.server.ts`. Decrypts the property key, calls `runReport` / `runRealtimeReport` / `getMetadata` (10-min cache) / the dashboard loader, and flattens `GoogleAnalyticsApiError` into `{ code, message, status, retryable }`. Without it (Mastra playground) the tools fail closed.                                                                      |
| `tools/google-analytics-tools.ts`                                          | `listGoogleAnalyticsProperties` (scope only), `getGoogleAnalyticsOverview` (the cached dashboard, compacted), `runGoogleAnalyticsReport` (≤ 4 dimensions, ≤ 10 metrics, 1–2 date ranges, filters, ≤ 200 rows, TOTAL row, quota echo), `runGoogleAnalyticsRealtimeReport` (last 30 min), `searchGoogleAnalyticsFields` (metadata search, ≤ 40 hits). Every call authorises the `propertyRowId` against the published scope and fails closed when the scope is missing. |
| `workspace/skills/ga4-reporting/SKILL.md`                                  | Long-form reference the agent loads for non-trivial reports: field names and scopes, compatibility rules, date syntax, filter/orderBy shapes, the eleven dashboard request bodies, thresholding / `(other)` / `(not set)` caveats, quota.                                                                                                                                                                                                                             |

Behaviour worth knowing:

- Google rejects unknown or incompatible fields with `INVALID_ARGUMENT`; the
  tool passes Google's wording back and the agent fixes the request (three
  attempts), mirroring how the SQL agents recover from query errors.
- Ranges default to end **yesterday** for the same reason as the dashboard;
  realtime answers "right now" only.
- Each custom report costs a handful of Data API tokens (standard properties:
  200,000/day). `getGoogleAnalyticsOverview` reuses the page cache, so
  "summarise this page" costs nothing extra.
- Realtime shares the property's **realtime per-project-per-hour** token
  bucket with the "Live now" card, which polls every 60 s from every open
  tab. On 2026-10-16 both the card and the assistant hit "Exhausted property
  tokens for a project per hour" on the Pizza Hut property; the assistant
  then tells the user to retry later and does not loop.
- Open WebUI routing is not configured for this agent.

## Routes

| Route                                                                | Guard                                     | Purpose                                            |
| -------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------- |
| `GET /google-analytics?brand=&property=&range=`                      | `googleAnalytics: ["view"]` + brand scope | Dashboard page + assistant widget                  |
| `POST /api/ai/chat` with `agentId: "google-analytics-agent"`         | `googleAnalytics: ["view"]` + GA scope    | Assistant conversation                             |
| `GET /api/google-analytics/dashboard-status?brand=&property=&range=` | `googleAnalytics: ["view"]` + brand scope | Pending widgets + retry job state (no Google call) |
| `POST /google-analytics?/clearCache`                                 | admin ∨ superUser                         | Drop cached reports, queued retries, memory caches |
| `GET/POST /api/admin/brands/[brandId]/google-analytics`              | admin ∧ `brand: ["manage"]`               | List / add property                                |
| `PATCH/DELETE /api/admin/brands/[brandId]/google-analytics/[rowId]`  | admin ∧ `brand: ["manage"]`               | Rename, (de)activate, replace key                  |
| `POST /api/admin/brands/[brandId]/google-analytics/[rowId]/verify`   | admin ∧ `brand: ["manage"]`               | Test connection; records result                    |

## Env

```
GOOGLE_ANALYTICS_CREDENTIALS_KEY=""      # 32 bytes base64; required to store/read keys
GOOGLE_ANALYTICS_CACHE_TTL_MS="21600000"       # report freshness window (Postgres cache), 0 = always refetch
GOOGLE_ANALYTICS_REFRESH_ENABLED="true"        # in-process retry sweep for refused reports
GOOGLE_ANALYTICS_REFRESH_CRON="* * * * *"      # sweep schedule
GOOGLE_ANALYTICS_REFRESH_MAX_AGE_HOURS="48"    # give up (keep serving stale) after this
```
