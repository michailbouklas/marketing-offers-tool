# Frontend handoff: querying Foody period data correctly

**Date:** 2026-07-10
**From:** aggregator-merchant-scraper (owns the DB + Prisma migrations)
**To:** frontend/UI team (reads the DB via `MERCHANT_SCRAPES_DATABASE_URL`)
**Supersedes:** the read conventions in `frontend-handoff-historical-data.md` (its 2026-07-09/10 addenda point here). Everything else in that doc still applies.

## TL;DR

- Foody KPI snapshots are now labeled with the **reporting period** they cover: `periodStart`/`periodEnd` = a _closed_ calendar period (a completed Mon–Sun week, or a completed calendar month), not the scrape time.
- The scraper may scrape the **same period more than once** (re-runs, retries). The table is append-only, so duplicates-per-period exist by design.
- **Don't hand-roll the dedup — query the `foody_*` views.** They return exactly one row per store per period (the latest scrape wins) and hide every sharp edge listed below.
- The three rules that keep numbers accurate: **(1)** never mix week rows and month rows in one aggregate, **(2)** recompute ratios from sums, **(3)** rating/review totals are all-time — take latest, never sum.

---

## 1. The data model in one minute

Every scraper run appends one `ScrapeSnapshot` per store (`@@unique([storeId, scrapedAt])`), with KPI child rows (`MetricsSnapshot`, `ClosuresSnapshot`, `PunctualitySnapshot`, `OrderRejectionsSnapshot`, `RatingSnapshot`) created **only when that section produced data**.

Temporal fields and what they mean:

| Field                                          | Meaning                                                                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scrapedAt`                                    | When the scraper ran. **Not** what the numbers cover. Use only for tie-breaking / freshness.                                                                                                                  |
| `periodStart`, `periodEnd` (`date`, inclusive) | The window the KPI numbers cover. Week rows = previous completed Mon–Sun; month rows = previous completed calendar month. Always a _closed_ period, so re-scrapes of it return identical portal data.         |
| `periodStart IS NULL`                          | **Legacy row** (scraped before 2026-07-09, or with pinning disabled): its window was a rolling `scrapedAt−7d..−1d`. Not comparable to anything — keep out of period queries (the views already exclude them). |

**Identity of a data point = `(storeId, periodStart, periodEnd)`.** Both dates are required in the key: a month that starts on a Monday shares its `periodStart` with that week's row (e.g. week `2026-06-01..06-07` vs month `2026-06-01..06-30`). Deduping on `(storeId, periodStart)` alone silently merges a week with a month.

Backing index (so these reads stay fast as history grows):
`ScrapeSnapshot_storeId_periodStart_periodEnd_scrapedAt_idx` on `("storeId", "periodStart", "periodEnd", "scrapedAt" DESC)`.

---

## 2. The views — use these, not the base tables

Created by migration `20260710072507_foody_period_views_and_dedup_index`. Each `*_by_period` view returns **the latest snapshot per `(storeId, periodStart, periodEnd)` where that KPI section produced data**, restricted to `aggregator = 'FOODY'`, legacy null-period rows excluded.

| View                          | One row per                        | Columns (besides `storeId`, `name`, `slug`, `periodStart`, `periodEnd`, `period_days`, `scrapedAt`, `snapshot_id`, `section_status`)                           |
| ----------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `foody_metrics_by_period`     | store × period                     | `sales`, `orders`, `avgBasketSize`, `avgBasketItems`, `completedOrders`                                                                                        |
| `foody_closures_by_period`    | store × period                     | `offlineOpenHoursPct`, `offlineDurationSeconds`, `offlineDurationRaw`, `unreachableSeconds`, `unreachableRaw`; `closures_snapshot_id` → join `"ClosureReason"` |
| `foody_punctuality_by_period` | store × period                     | `avoidableWaitOrdersPct`, `deliveredOrders`, `totalOrders`, `avgAvoidableWaitSeconds`, `avgAvoidableWaitRaw`                                                   |
| `foody_rejections_by_period`  | store × period                     | `cancellationsPct`, `cancellationsCount`, `lostSales`, `reasonUnknownCount`; `rejections_snapshot_id` → join `"CancellationReason"`                            |
| `foody_rating_latest`         | store (latest only, **no period**) | `storeRating`, `totalReviews`; `rating_snapshot_id` → join `"RatingStarBucket"`                                                                                |

**`period_days`** is the period-kind discriminator: `7` = week, `28..31` = month. Every aggregate you write must filter on it (see rule 1 below).

Why per-KPI views instead of one wide view: a section can fail on any run, so the newest snapshot of a period may have metrics but no closures. Each view independently picks the latest snapshot _that has its section_ — the correct "latest where the child exists" pattern you already use, per period.

---

## 3. The three accuracy rules

### Rule 1 — never mix week rows and month rows in one aggregate

A month row _overlaps_ its week rows: summing both counts the same orders twice. Every query must pick a lane:

```sql
WHERE period_days = 7      -- weekly series
WHERE period_days >= 28    -- monthly series
```

There is no query where mixing them is correct.

### Rule 2 — ratios are recomputed from sums, never averaged

`avgBasketSize` is `sales/orders` _within one row_. Across rows (several stores, several periods) the small-denominator rows would be over-weighted by `AVG()`:

```sql
-- WRONG: AVG("avgBasketSize")
-- RIGHT:
SUM(sales) / NULLIF(SUM(orders), 0) AS avg_basket_size
```

Same for every percentage: re-derive from the numerator/denominator you're aggregating (punctuality: weight by `totalOrders`; rejections: by order counts), or don't aggregate the percentage at all.

### Rule 3 — rating and review counts are all-time, not per-period

`storeRating`/`totalReviews` come from the portal's Reviews page and are **cumulative all-time values** that merely ride along on each snapshot. Summing them across periods double-counts the same total; even averaging is meaningless. Use `foody_rating_latest` (one row per store, the current value). For a rating _trend_, plot the value per `scrapedAt` — it's a level, not a flow.

---

## 4. Recipes for typical UI screens

### KPI card: latest completed week, one store

```sql
SELECT "periodStart", "periodEnd", sales, orders, "avgBasketSize"
FROM foody_metrics_by_period
WHERE "storeId" = $1 AND period_days = 7
ORDER BY "periodStart" DESC
LIMIT 1;
```

### Weekly trend chart (last 12 weeks, one store)

```sql
SELECT "periodStart", sales, orders
FROM foody_metrics_by_period
WHERE "storeId" = $1 AND period_days = 7
ORDER BY "periodStart" DESC
LIMIT 12;
```

One point per week, guaranteed — no matter how many times each week was scraped.

### Exact numbers for a calendar month, all stores

Month rows are produced by the scraper's monthly pass (`foody:scrape:month`, runs after each month closes). A month is **one row**, already exact — no summing:

```sql
SELECT "storeId", "name", sales, orders, "avgBasketSize"
FROM foody_metrics_by_period
WHERE period_days >= 28 AND "periodStart" = '2026-06-01';
```

### Company-wide totals for a month (aggregating stores)

```sql
SELECT SUM(sales)                                AS sales,
       SUM(orders)                               AS orders,
       SUM(sales) / NULLIF(SUM(orders), 0)       AS avg_basket_size   -- rule 2
FROM foody_metrics_by_period
WHERE period_days >= 28 AND "periodStart" = '2026-06-01';
```

### Rejection reasons for a period (child-table join)

```sql
SELECT v."name", cr.reason, cr.cancellations, cr."salesLoss"
FROM foody_rejections_by_period v
JOIN "CancellationReason" cr ON cr."orderRejectionsSnapshotId" = v.rejections_snapshot_id
WHERE v.period_days = 7 AND v."periodStart" = $1;
```

Same pattern: `"ClosureReason"` via `closures_snapshot_id`, `"RatingStarBucket"` via `rating_snapshot_id`.

### Current store ratings (dashboard)

```sql
SELECT "storeId", "name", "storeRating", "totalReviews"
FROM foody_rating_latest;
```

### Months from before the monthly pass existed (approximation — label it in the UI)

Attribute each week to the month of its Monday and sum. This yields "the 4–5 whole weeks starting in that month", **not** the exact calendar month — mark it as approximate wherever shown:

```sql
SELECT "storeId",
       date_trunc('month', "periodStart")::date AS approx_month,
       SUM(sales)                                AS sales,
       SUM(orders)                               AS orders,
       SUM(sales) / NULLIF(SUM(orders), 0)       AS avg_basket_size
FROM foody_metrics_by_period
WHERE period_days = 7
GROUP BY "storeId", 2;
```

Once a real month row exists for a month, prefer it and drop the approximation for that month.

---

## 5. Using the views from Prisma

Two options; both fine:

1. **`$queryRaw` with a typed wrapper** — zero schema changes:
   ```ts
   const rows = await prisma.$queryRaw<WeeklyMetricsRow[]>`
     SELECT "storeId", "periodStart", sales, orders
     FROM foody_metrics_by_period
     WHERE period_days = 7 AND "storeId" = ${storeId}
     ORDER BY "periodStart" DESC LIMIT 12`;
   ```
2. **Model the views in your schema copy** (`prisma/merchant-scrapes/schema.prisma`) as `view` blocks with the `views` preview feature, or as plain read-only models. Safe because you never run migrations against this DB — our repo owns them (same source-of-truth rule as before). If you add them, treat this doc's column lists as the contract.

`sales`, `avgBasketSize`, `lostSales` are Postgres `numeric` — Prisma returns `Decimal`; convert deliberately, don't `parseFloat` the raw column in SQL.

---

## 6. Pitfalls checklist (things that will silently produce wrong numbers)

- ❌ Summing/averaging over `ScrapeSnapshot` by `scrapedAt` date range — double-counts re-scraped periods and mixes period kinds. Use the views.
- ❌ Deduping on `(storeId, periodStart)` without `periodEnd` — merges a Monday-starting month with its first week.
- ❌ Mixing `period_days = 7` and `>= 28` rows in one SUM/AVG/COUNT.
- ❌ `AVG("avgBasketSize")` or averaging any percentage across rows.
- ❌ Summing `totalReviews` / star-bucket counts across periods (all-time values).
- ❌ Treating a missing row as `0` — a store absent from a view for a period means _that section produced no data that scrape_ ("failed"), not a real zero. Check `SectionResult.status` via `snapshot_id` if you need to distinguish.
- ❌ Including legacy rows (`periodStart IS NULL`) in period math. They remain in the base table for history but cover unknowable rolling windows. The views already exclude them.
- ⚠️ Rows scraped 2026-07-09/10 during the rollout may be period-less even though they're recent (old scraper code replace-wrote a few) — they're correctly labeled legacy; nothing to handle beyond the null rule above.

## Questions / changes

The canonical definitions live in this repo: `prisma/schema.prisma` (models + index) and `prisma/migrations/20260710072507_foody_period_views_and_dedup_index/migration.sql` (exact view SQL). If you need another column exposed in a view, ask us — don't create views in this DB yourselves.
