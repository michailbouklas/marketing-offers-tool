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

| File                   | Role                                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `google-analytics.ts`  | Browser-safe types, URL filter helpers, the service-account Zod schema, formatters.                                                                               |
| `properties.server.ts` | Prisma CRUD for properties, credential (de)encryption, the viewer scope (`listGoogleAnalyticsBrandsForUser`, `resolveGoogleAnalyticsScope` — out-of-scope ⇒ 403). |
| `ga4-client.server.ts` | REST client: RS256 JWT assertion → OAuth token (cached per service account), `runReport`, `batchRunReports`, `verifyPropertyAccess`, error → user message.        |
| `dashboard-reports.ts` | Pure request builders and the response → `GoogleAnalyticsDashboard` mapper (unit-tested).                                                                         |
| `dashboard.server.ts`  | One `batchRunReports` call (5 reports) per (property, range), cached.                                                                                             |

- Date ranges end **yesterday** (`NdaysAgo` → `yesterday`): GA4 reports today
  only partially, so "last 7 days" means the seven complete days before today.
- Reports: daily `date` series with `metricAggregations: TOTAL` (the TOTAL row
  feeds the tiles so `activeUsers` is not over-counted by summing days), plus
  top-10 breakdowns by `sessionDefaultChannelGroup`, `pagePath`,
  `deviceCategory`, `country` ordered by sessions.
- Cache: `GOOGLE_ANALYTICS_CACHE_TTL_MS` (default 10 min) per process, keyed by
  property row + range, invalidated whenever an admin edits any property.
  Standard GA4 properties have a daily Data API token quota; one dashboard load
  costs one batch request.
- Failures (key rejected, no Viewer grant, quota, Google unreachable, missing
  encryption key) are shown inline on the page via
  `describeGoogleAnalyticsError`, so the user can still switch brand / period.

## Routes

| Route                                                               | Guard                                     | Purpose                           |
| ------------------------------------------------------------------- | ----------------------------------------- | --------------------------------- |
| `GET /google-analytics?brand=&property=&range=`                     | `googleAnalytics: ["view"]` + brand scope | Dashboard page                    |
| `GET/POST /api/admin/brands/[brandId]/google-analytics`             | admin ∧ `brand: ["manage"]`               | List / add property               |
| `PATCH/DELETE /api/admin/brands/[brandId]/google-analytics/[rowId]` | admin ∧ `brand: ["manage"]`               | Rename, (de)activate, replace key |
| `POST /api/admin/brands/[brandId]/google-analytics/[rowId]/verify`  | admin ∧ `brand: ["manage"]`               | Test connection; records result   |

## Env

```
GOOGLE_ANALYTICS_CREDENTIALS_KEY=""      # 32 bytes base64; required to store/read keys
GOOGLE_ANALYTICS_CACHE_TTL_MS="600000"   # dashboard cache, 0 disables
```
