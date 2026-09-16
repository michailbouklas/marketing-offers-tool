# Pipeline changes (2026-09-15): impact on the Google Reviews UI

Audience: the team owning `marketing-offers-tool/src/routes/google-reviews`.
Source of truth for the UI is the ClickHouse database `google_maps_scraper_replica`
(engine `MaterializedPostgreSQL`, host `200.1.3.249:8123`), which replicates the scraper's
PostgreSQL database. Every statement below was checked against both databases on
2026-09-15 around 12:00 UTC.

## TL;DR

| # | Change | UI code change needed? | Action |
|---|--------|------------------------|--------|
| 1 | `reviews` gained a column (`import_batch_id uuid NULL`) | No | **Replica admin: re-attach `reviews` in ClickHouse.** Per ClickHouse docs a column addition stops replication of that table. |
| 2 | Duplicate review rows were merged and deleted in PostgreSQL | No | Already replicated (35,922 `_sign = -1` rows visible). `FINAL` hides them. |
| 3 | New tables `pipeline_runs`, `pipeline_run_stages` | No (optional feature) | Not in the replica. `ATTACH TABLE` them only if the UI wants run status. |
| 4 | Going forward, a reviewer can have several reviews for one business | No | Row counts from `reviews` will grow relative to `review_summaries.review_count`. |
| 5 | `reviews.review_date` is now filled for relative dates ("2 months ago") | No | More rows enter the date-based charts; dates are approximate (see §4.3). |
| 6 | Failed sentiment calls now leave `sentiment` NULL instead of writing a fake `neutral` | No | Expect slightly more `null` sentiment and slightly fewer `neutral`. |
| 7 | Snapshot tables get one row per business per day | No (UI does not read them) | Only relevant to Grafana panels. |
| 8 | `reviews` gained `google_review_id text NULL` (migration 012, 2026-09-16) | No | **Replica admin: re-attach `reviews` again** (same procedure as §1). |
| 9 | Translated duplicate reviews (~1,200 rows) will be merged and deleted | No | Replicates as `_sign = -1`; `FINAL` hides them (same as §2). |

None of the ClickHouse queries under `src/lib/services/google-reviews/*.server.ts` need to
change. Items 1 and 3 are operations on the replica, not code.

---

## 0. Replica health (checked 2026-09-16 10:50 UTC)

**Corrected finding.** The `google_maps_scraper_replica` consumer is alive: a probe update on
`reviews` at 10:47:36 advanced the Postgres slot within 10 s, and the 10:34 changes to
`businesses` and `review_summaries` are in the replica. The slot shows `active = false` because
this engine polls with `pg_logical_slot_peek_binary_changes`, not a streaming walsender; that is
normal.

**But `reviews` is stuck.** Two `DETACH … PERMANENTLY` + `ATTACH` cycles were run on `reviews`
three minutes apart (10:21:57 and 10:24:18), the second while the first snapshot was still
loading. The consumer keeps an in-memory skip list keyed by relation OID that `ATTACH TABLE`
does not clear (see `MaterializedPostgreSQLConsumer::addNested`), so after logging
"Synchronization is started for table: reviews" at 10:34:23 it silently drops every further
`reviews` change. `reviews` in the replica is a 10:24 snapshot; all other tables stream. Fix:
restart the database's replication handler (below), then re-attach `reviews` once to catch the
changes made since the snapshot. Never run two DETACH/ATTACH cycles on the same table without
waiting for "Table `reviews` successfully added to replication" in `system.text_log`.

**Unrelated, but urgent for the Postgres host.** The error
`Columns number mismatch. Attributes: 11, buffer: 11 (LOGICAL_ERROR)` that repeats every ~6 s
since 2026-02-17 belongs to `aggregator_invoices_replica`, not to this database. Its table
`brand` has 11 columns in Postgres and 9 in ClickHouse, so that consumer never starts, and the
`aggregator_invoices` slot is holding **158 GB of WAL** on the Postgres server. Fix:
`DETACH TABLE aggregator_invoices_replica.brand PERMANENTLY; ATTACH TABLE aggregator_invoices_replica.brand;`
(or drop and re-create that replica database if the 7-month backlog is not wanted).

---

## 1. Replication: the `reviews` table must be re-attached

### What happened

Migration `010_pipeline_runs.sql` ran `ALTER TABLE reviews ADD COLUMN import_batch_id uuid`.
The replica is a `MaterializedPostgreSQL` database. ClickHouse documents that:

> If a schema change occurs that breaks replication, such as adding or removing columns, the
> affected table will stop receiving updates. In these cases, users must manually reload the
> table using ATTACH or DETACH PERMANENTLY queries.

State observed on 2026-09-15:

```
PostgreSQL  reviews: 100,603 rows, max(updated_at) = 2026-09-15 11:38:05, has import_batch_id
ClickHouse  reviews FINAL: 100,603 rows, max(updated_at) = 2026-09-15 11:38:05, NO import_batch_id column
```

The two sides still agree because nothing has been written to `reviews` since the column was
added. The next pipeline run will insert reviews that the replica will not receive.

### What to do (replica admin, ClickHouse)

```sql
-- Re-snapshot the table; picks up the new column and resumes logical replication.
DETACH TABLE google_maps_scraper_replica.reviews PERMANENTLY;
ATTACH TABLE google_maps_scraper_replica.reviews;
```

The re-snapshot copies the full table (about 100k rows); the UI will see an empty or partial
`reviews` table for the duration. Do it outside business hours or behind a maintenance notice.

### How to verify replication is live again

Run both after the next import (Postgres left, ClickHouse right):

```sql
-- PostgreSQL
SELECT count(*), max(id), max(updated_at) FROM reviews;

-- ClickHouse
SELECT count(), max(id), max(updated_at) FROM google_maps_scraper_replica.reviews FINAL;
SELECT count() FROM system.columns
 WHERE database = 'google_maps_scraper_replica' AND table = 'reviews' AND name = 'import_batch_id';  -- expect 1
```

### After re-attach: the new column

`reviews.import_batch_id` (`Nullable(UUID)` in ClickHouse) is the id of the pipeline run that
inserted the row. It is NULL for every row that existed before 2026-09-15 and for rows imported
outside the orchestrator. The UI can ignore it. If you want to show "new since last run", join
it to `pipeline_runs.run_id` (see §3).

All existing SELECTs name their columns explicitly, so nothing breaks either way. If you extend
`ReviewQueryRow` / `GoogleReviewRow` / `mapReviewRow` in `reviews.server.ts`, also refresh
`docs/google-reviews/schema.sql` and the agent skill table in
`src/lib/server/mastra/workspace/skills/google-reviews-sql/SKILL.md`.

---

## 2. Duplicate reviews were merged (already replicated)

### Why

The importer used to compute `review_text_hash` from a field that does not exist, so every
review got the same hash. With the unique key `(business_cid, reviewer_name, review_text_hash)`
only one review per reviewer per business could ever be stored; later reviews by the same
person were silently dropped. Some rows had been backfilled with the correct hash by an earlier
script, so the same review existed twice.

### What changed in the data

- Each duplicate group was collapsed into one keeper row. The keeper is the row that already had
  sentiment, then embedding, then a category, then the lowest id. Missing enrichment was copied
  from the discarded row onto the keeper.
- `sentiment_correction_audit` rows were re-pointed to the keeper; `review_sentiment_analysis`
  rows were moved when the keeper had none.
- Discarded rows were deleted. ClickHouse received the deletes (`_sign = -1`); `FINAL` already
  hides them, which every UI query uses.
- `review_text_hash` is being recomputed as `md5(coalesce(review_text, ''))` for all rows
  (47,280 rows still carried the empty-string hash at the time of writing; the rehash is the
  final step of migration 007 and does not collide any more).

### UI consequences

- `reviews.id` values that were deleted no longer appear. The UI only uses `id` as a sort
  tiebreaker and Svelte `{#each}` key, never in URLs, so nothing breaks. Anyone holding review
  ids in bookmarks or exports may find some gone.
- Nothing in the UI groups by reviewer or uses `review_text_hash`. No change needed.

---

## 3. New tables `pipeline_runs` and `pipeline_run_stages` (optional)

Created in PostgreSQL by migration 010. **Not** in the replica: MaterializedPostgreSQL only
replicates tables that existed when the database was created. If the UI wants to show "last
successful run", attach them:

```sql
ATTACH TABLE google_maps_scraper_replica.pipeline_runs;
ATTACH TABLE google_maps_scraper_replica.pipeline_run_stages;
```

Shapes:

```
pipeline_runs        run_id uuid PK, started_at, finished_at, status ('running'|'ok'|'warn'|'failed'),
                     exit_code int, stages jsonb, argv text, run_dir text, host text, error text
pipeline_run_stages  (run_id, stage) PK, status ('running'|'ok'|'warn'|'failed'|'skipped'),
                     started_at, finished_at, exit_code int, counts jsonb, error text
                     stage ∈ scrape, import, sentiment, embeddings, categorization, timeseries
```

Example, latest run and its stages:

```sql
SELECT r.run_id, r.status, r.started_at, r.finished_at,
       s.stage, s.status AS stage_status, s.counts
FROM google_maps_scraper_replica.pipeline_runs AS r FINAL
LEFT JOIN google_maps_scraper_replica.pipeline_run_stages AS s FINAL ON s.run_id = r.run_id
WHERE r.run_id = (SELECT run_id FROM google_maps_scraper_replica.pipeline_runs FINAL
                  ORDER BY started_at DESC LIMIT 1)
ORDER BY s.started_at;
```

`counts` for the scrape stage includes `businesses` and `image_digest`; the other stages leave
it NULL for now.

---

## 4. Data semantics that shift from now on

### 4.1 More reviews per business

With the hash fixed, the next scrape inserts reviews that were previously dropped. Expect:

- `count()` over `reviews` per business to rise, possibly sharply for busy places.
- `review_summaries.review_count` (Google's own total, written by the scraper) is unchanged, so
  the ratio `reviews rows / review_summaries.review_count` moves closer to 1. The dashboard's
  `total_reviews` tile reads `review_summaries`, the reviews list reads `reviews`; they were
  never equal and will now diverge less.
- Reviews per day and the per-business monthly chart will show more volume for past months as
  older reviews get inserted (they carry their original `review_date`, see 4.3).

### 4.2 Sentiment NULL instead of fake neutral

Previously, when OpenAI returned a rate-limit, timeout or auth error, the CLI wrote
`sentiment = 'neutral'` with certainty 0.2–0.5 and `review_sentiment_analysis.fallback_used =
false`. Those rows were never revisited. Now such reviews keep `sentiment = NULL` and are retried
on the next run. Only a genuinely unparseable model answer produces a neutral default, and it
sets `fallback_used = true`.

UI effect: `null` sentiment renders as "—" already. The dominant-sentiment filter on
`/google-reviews/businesses` reads `review_summaries.*_count`, which are recomputed by the
pipeline, so `neutral` may shrink slightly. No code change.

Historic rows written under the old behaviour (about 4,900: neutral defaults plus keyword-guessed
positives/negatives) are reset to `sentiment = NULL` by migration 011 and re-analysed on the next
sentiment run. Expect `null` sentiment to rise briefly and the per-business counts in
`review_summaries` to shift once the re-analysis completes. Their `review_sentiment_analysis`
rows are kept with `fallback_used = true`.

`review_summaries.positive_count / neutral_count / negative_count / average_sentiment_confidence`
are now refreshed by the pipeline's timeseries stage (function `update_sentiment_summary_timeseries`),
not by the sentiment CLI. Same columns, same meaning, refreshed once per pipeline run.

### 4.3 `review_date` is populated for relative dates

The scraper emits `When` as either an absolute date or a phrase like "2 months ago" or "a year
ago". The importer used to store NULL for the phrases. It now resolves them against the import
time: "2 months ago" imported on 2026-09-15 becomes 2026-07-15T…Z.

UI effect:

- Rows that would have been excluded by `WHERE review_date IS NOT NULL` (dashboard timeseries,
  monthly chart) now count. The 45-day window anchored on `max(review_date)` will include them.
- Precision is only as good as the phrase: a "2 months ago" review is placed exactly two months
  before import, so per-day charts get artificial spikes on import days at month offsets. The
  per-month chart is unaffected. If day-level accuracy matters, the scraper team can add a
  `review_date_precision` column; ask for it rather than inferring from the timestamp.
- Only reviews inserted from now on are affected; existing NULL dates stay NULL.

### 4.4 Sorting by `id` versus `created_at`

The sentiment CLI now processes newest reviews first by `id` rather than `created_at`. Since
`id` is a serial this is the same order; mentioned only so nobody is surprised by the SQL.

---

## 5. Things that did not change

- Table and column names used by the UI: `businesses`, `reviews`, `review_summaries`,
  `review_categories`, `review_category_metrics_timeseries`, `business_features`,
  `operating_hours`, `ordering_options`. No renames, no type changes, no removals.
- `reviews.sentiment` values stay lowercase `positive|neutral|negative`.
- `review_category_metrics_timeseries` is still appended once per categorization run with a
  fresh `run_id`; the "latest snapshot = max(snapshot_date)" query in `businesses.server.ts`
  keeps working.
- `sentiment_summary_timeseries` and `business_review_metrics` now hold one row per business
  per calendar day (refreshed in place when the pipeline runs twice). The UI does not read
  them; Grafana panels that assumed several rows per day (e.g. picking the max `recorded_at`)
  keep working, they just see one row.

---

## 6. Reviews are now identified by Google's review id (2026-09-16)

### Why

Until now a review was identified by `(business_cid, reviewer_name, md5(review_text))`.
Google returns the same review in a different language depending on the scrape language, so a
re-scrape produced a second row for the same review (Greek original + English translation),
with `sentiment = NULL`. Those rows were re-analysed, re-embedded and re-categorised, which is
both wasteful and non-deterministic (the classifier could invent a new category for a complaint
that already had one). On 2026-09-16 the database held 1,379 reviewer/business groups with more
than one row; 1,198 of them were translated copies created by the 2026-09-15 scrape.

### What changed in the data

- Migration 012 adds `reviews.google_review_id text NULL` with a unique index
  (`WHERE google_review_id IS NOT NULL`). The importer now writes Google's `review_id` there and
  skips any incoming review whose id is already present.
- Rows imported before 012 have `NULL`. The importer backfills the id the next time the same
  review is scraped, matching on the text hash of either language variant, so the column fills
  in gradually. Do not treat `NULL` as "not a Google review".
- `review_date` now prefers the scraper's absolute `published_at` over the relative `When`, so
  new rows get exact timestamps. When a legacy row is adopted, its `review_date` is replaced by the
  exact `published_at` too (it was NULL for ~90% of rows, approximate for the rest), so re-scraping
  progressively backfills real dates. Expect `review_date` to change on existing rows and the
  dated share of `reviews` to grow with every run.
- Dashboard charts "Reviews per day" / "Average rating per day" (`dashboard.server.ts`) now anchor
  their 45-day window on the latest day whose trailing window holds at least 30 dated reviews,
  instead of the plain `max(review_date)`. On 2026-09-16 two freshly imported rows dated
  "a month ago" had moved the anchor past all real data and emptied both charts.
- The existing translated duplicates are merged by `scripts/merge-translated-duplicates.ts`
  (dry run by default). Same recipe as §2: keeper keeps or inherits enrichment,
  `sentiment_correction_audit` re-pointed, `review_sentiment_analysis` moved, loser deleted.
  Expect roughly 1,200 `reviews.id` values to disappear and `review_count`-vs-rows gaps in
  §4.1 to shrink accordingly.

### UI consequences

- Column addition: the replica stops replicating `reviews` until re-attached (§1 procedure).
- Nothing in the UI reads `google_review_id`. If wanted (e.g. deep link to the review on Google
  Maps), extend `ReviewQueryRow` / `GoogleReviewRow` / `mapReviewRow` as in §1.
- Deleted ids: same caveats as §2.

---

## 7. Checklist

Replica admin
- [ ] `DETACH TABLE … reviews PERMANENTLY; ATTACH TABLE … reviews;` (§1), and again after migration 012 (§6)
- [ ] Optionally attach `pipeline_runs`, `pipeline_run_stages` (§3)
- [ ] Verify counts match after the next pipeline run (§1)

UI team
- [ ] No mandatory code changes.
- [ ] If adding `import_batch_id` or run status to the UI: extend `ReviewQueryRow`,
      `GoogleReviewRow`, `mapReviewRow`, `docs/google-reviews/schema.sql`, and the agent SQL
      skill's table list.
- [ ] Be aware of the day-level date approximation (§4.3) when reading the reviews-per-day chart.

Scraper team (done in the `google-maps-scraper` repo)
- [x] Migrations 007, 009, 010 written; 009 and 010 applied by hand on 2026-09-15; 007's rehash
      step still pending (`bun run migrate:up` applies it and records all three in
      `schema_migrations`).
- [x] Migration 012 (`google_review_id`) applied 2026-09-16; importer keys reviews on it (§6).
- [ ] Run `bun run scripts/merge-translated-duplicates.ts --apply` after reviewing the dry run (§6).
