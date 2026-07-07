# Frontend handoff: historical snapshots in `aggregator_merchant_scrapes`

**Date:** 2026-07-06
**From:** aggregator-merchant-scraper (owns the DB + Prisma migrations)
**To:** frontend team (reads the DB via Prisma through `MERCHANT_SCRAPES_DATABASE_URL`)
**Source files referenced by the frontend:** `src/lib/server/merchant-scrapes-prisma.ts`, `prisma/merchant-scrapes/schema.prisma`, `src/lib/services/aggregator-kpis/*.server.ts`

## TL;DR

**Almost nothing you do needs to change.** Your KPI reads already use the pattern "latest `ScrapeSnapshot.scrapedAt` where the child exists" and you already have trend views filtering on `scrapedAt` — that is exactly how a time-series table is meant to be read, so the shift from "≈one snapshot per store" to "many snapshots per store over time" is already handled by your existing queries.

There are **three things to act on**, none of them a breaking change to current screens:

1. **`runId` is now populated** — new, nullable, optional to adopt (enables run-based grouping/filtering). No client regen needed.
2. **`BOLT` enum drift is a latent runtime bug** — the DB enum is `{ FOODY, WOLT }` only; your schema copy has `BOLT`. Filtering by `BOLT` will throw. Fix the drift.
3. **The table now grows unbounded** — verify your per-store "latest" queries stay index-backed as history accumulates.

---

## What changed on our side

Schema change was **additive only** — one new index, no columns removed or renamed:

- Migration `20260706080020_scrape_snapshot_run_id_index` adds `@@index([runId])` on `ScrapeSnapshot`.
- `ScrapeSnapshot.runId` (nullable) **already existed** in the model since the init migration — it was just always `null`. It is **now populated** on every new snapshot (one id per scraper run, e.g. `"2026-07-06T08-02-00-010Z"`, shared across all stores in that run). **Rows written before 2026-07-06 keep `runId = null`.**
- Behaviourally: each scraper run now appends a new `ScrapeSnapshot` per store (unique on `storeId + scrapedAt`) and **preserves it permanently**. Previously history was effectively lossy (files overwritten, DB rebuild produced one row per store). The table is now a real time series and grows over time.
- `ScrapeSnapshot.sourceFile` now points into `history/<runId>/…` instead of the top-level file. You don't read this field, so no action.

> **The Prisma Client types did not change.** An index is invisible to the generated client, and `runId` was already in the model. So you can read `runId` today with no `prisma generate`, and existing generated code keeps working.

---

## Impact per UI area (from your notes)

| Area                 | Fields you use                                                                                                                                 | Verdict                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Store filter/list | `Store.id/name/aggregator`                                                                                                                     | ✅ No change. Store identity is unaffected.                                                                                          |
| 2. Dashboard         | `Store.aggregator` groupBy, `Review.count()`                                                                                                   | ⚠️ See **BOLT drift** below — counting only `FOODY`/`WOLT` is _correct for current data_, but your schema copy claims `BOLT` exists. |
| 3. Closures          | latest `scrapedAt` where `closures` exists; `offlineOpenHoursPct`, `unreachableSeconds`; trend by `scrapedAt`                                  | ✅ Pattern is correct for history. See **latest-snapshot subtlety**.                                                                 |
| 4. Order rejections  | latest where `rejections` exists; `cancellationsPct`, `lostSales`, `reasonUnknownCount`; trend by `scrapedAt`                                  | ✅ Same as above.                                                                                                                    |
| 5. Punctuality       | latest where `punctuality` exists; `avoidableWaitOrdersPct`, `avgAvoidableWaitSeconds`, `deliveredOrders`, `totalOrders`; trend by `scrapedAt` | ✅ Same as above.                                                                                                                    |
| 6. Ratings           | latest where `rating` exists; `storeRating`, `totalReviews`, `RatingStarBucket.stars/count`; trend by `scrapedAt`                              | ✅ Same as above.                                                                                                                    |
| 7. Reviews table     | `Review.id/storeId/rating/comment/reviewedAt` + joined `Store.name/aggregator`                                                                 | ✅ No change. `Review` is a durable upserted entity (one row per review), not a snapshot. See **reviewedAt nulls**.                  |

---

## Action items

### 1. `BOLT` enum drift — fix this (real runtime risk)

The **canonical DB enum is `Aggregator { FOODY, WOLT }`** — `BOLT` is **not** in the database, and no scraper writes Bolt data today. Your schema copy (`prisma/merchant-scrapes/schema.prisma`) declaring `BOLT` means the DB and your client disagree.

- Your dashboard counting only `FOODY`/`WOLT` and your browser-safe constants exposing `["FOODY","WOLT"]` are **correct for the actual data** — nothing renders wrong today.
- **The risk:** if any query does `where: { aggregator: "BOLT" }` (or an `in: [...,"BOLT"]`), Prisma sends an enum value Postgres doesn't have → **`invalid input value for enum` at runtime.** Reads/filters, not just writes.
- **Do:** bring `prisma/merchant-scrapes/schema.prisma` back in sync with our canonical `prisma/schema.prisma` — i.e. **remove `BOLT`** until it actually exists.
- **When Bolt is real:** it must be added to the **canonical scraper schema + a migration first** (our repo), then you resync your copy. Don't let the two schemas diverge again — ours is the source of truth for this DB.

### 2. Adopt `runId` if useful (optional, non-breaking)

Now that `runId` is populated you can, without any schema/client change:

- Group snapshots into "runs" (a batch scraped together) for run-over-run comparison.
- Add a "results of run X" filter — the new `@@index([runId])` supports it.
- Treat `runId = null` as "legacy / pre-2026-07-06, ungrouped" — don't drop those rows from history/trend views.

Ignore it entirely and everything still works.

### 3. Keep per-store "latest" queries index-backed (forward-looking)

The table was young (~1 row/store) and will now grow with every run. Your per-store latest selection should ride an index rather than scan+sort growing history:

- Prefer `DISTINCT ON ("storeId") … ORDER BY "storeId", "scrapedAt" DESC`, or a correlated per-store latest — both use the existing `@@unique([storeId, scrapedAt])` composite.
- Available indexes: `@@unique([storeId, scrapedAt])`, `@@index([scrapedAt])` (your trend filters), `@@index([runId])`.
- Re-check `EXPLAIN` on the KPI list/trend queries once a few weeks of history has accumulated.

### 4. Latest-snapshot subtlety (correctness, applies to areas 3–6)

Because each run appends a snapshot and a section can fail on any run, a store's **most recent snapshot may not contain a given child** (e.g. the latest run's `closures` section failed → no `ClosuresSnapshot` for that snapshot). Your reported pattern — \*latest `scrapedAt` **where that child exists\*** — is exactly right; keep it.

- **Do not** switch to "take the latest snapshot per store, then read `.closures`" — that anti-pattern will now show gaps whenever the newest run's section failed, even though older data exists.
- KPI child rows are written **only for `ok`/`partial` sections**; a missing child means "no data," never a real `0`. Check `SectionResult.status` if you want to distinguish "failed" from "genuinely absent."

### 5. `Review.reviewedAt` nullability (minor)

`Review.reviewedAt` is nullable (the portal date can be unparseable). Since you sort/filter on it, decide how nulls behave (they sort last by default in Postgres; use `NULLS LAST`/`COALESCE` if you want deterministic placement). `firstSeenAt`/`lastSeenAt` are always set and available if you ever want a "new since last run" review view.

---

## Explicitly out of scope

The separate `SCRAPER_DATABASE_URL` DB you read via raw SQL in `src/lib/server/scraper-db.ts` (`offer_notification_queue`, `restaurant`) is a **different database** (the scraper's operational/notifications DB). **None of these changes touch it** — no impact on notifications.

---

## Reference — the data shape

`Store` (identity `aggregator + externalId`) → many `ScrapeSnapshot` (time series; `scrapedAt`, `runId`, `sourceFile`, `raw`, `periodStart/End`) → one-to-one KPI children per snapshot (`MetricsSnapshot`, `RatingSnapshot`+`RatingStarBucket`, `ClosuresSnapshot`, `PunctualitySnapshot`, `OrderRejectionsSnapshot`) + `SectionResult` rows. `Review` hangs off `Store` directly and is **upserted in place** (not a snapshot). Canonical definitions: `prisma/schema.prisma` in `aggregator-merchant-scraper` — treat it as the source of truth and keep `prisma/merchant-scrapes/schema.prisma` synced to it.

- `periodStart`/`periodEnd` are `null` for Foody (live snapshots); reserved for Wolt date ranges later.
