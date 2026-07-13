# Frontend handoff: Foody Pro Growth (pro subscription + new vs. returning customers)

**Date:** 2026-07-13
**From:** aggregator-merchant-scraper (owns the DB + Prisma migrations)
**To:** frontend/UI team (reads the DB via `MERCHANT_SCRAPES_DATABASE_URL`)
**Builds on:** `frontend-handoff-period-queries.md` — every read convention there (views-not-tables, `period_days` lanes, latest-per-period dedup, legacy-null exclusion) applies here unchanged. This doc only adds the new dataset.

## TL;DR

- New per-store, per-period dataset from the Foody Performance report's **Customers tab**, scraped since **2026-07-13** (first covered period: week `2026-07-06..2026-07-12`). No backfill exists or is possible — older periods simply have no rows.
- Two blocks per store per period:
  **Pro subscription** — orders placed on a Foody Pro subscription vs not (`proOrders`, `nonProOrders`), and
  **New vs. returning** — orders from first-time vs repeat customers (`newCustomerOrders`, `returningCustomerOrders`).
- **Query `foody_pro_growth_by_period`** — same shape and rules as the other four `*_by_period` views.
- The two headline UI numbers: **Pro share** = `proOrders / (proOrders + nonProOrders)` and **new-customer share** = `newCustomerOrders / (newCustomerOrders + returningCustomerOrders)` — always recomputed from sums when aggregating (rule 2 of the period-queries doc).
- **`proBoxFound = false` means the store is not on Foody Pro** — render "not on Pro", never `0`.

---

## 1. What the numbers mean (portal semantics)

| Column                    | Meaning                                                                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proOrders`               | Orders in the period placed by Foody Pro subscribers.                                                                                                                                                          |
| `nonProOrders`            | Orders in the period from non-Pro customers.                                                                                                                                                                   |
| `newCustomerOrders`       | Orders from **first-time** customers. "First-time" is judged against the customer's **all-time** history with the store — after their first ever order they count as returning forever, in every later period. |
| `returningCustomerOrders` | Orders from repeat customers (same all-time rule).                                                                                                                                                             |
| `proBoxFound`             | The Pro subscription box rendered for this store. `false` (with `section_status = 'OK'`) = the store isn't enrolled in Foody Pro — a legitimate state, not a scrape failure.                                   |
| `newVsReturningFound`     | The new-vs-returning block rendered. Expected `true` for every store; `false` with OK status would be unusual — surface it as "no data" rather than zeros.                                                     |

**The two blocks have independent denominators.** The portal's own example: pro box totals 11,236 orders while the doughnut totals 11,569 for the same store and window. Compute each share strictly within its own block, and never reconcile either total against `foody_metrics_by_period.orders` — all three counts are the portal's, each with its own inclusion rules.

---

## 2. The view

Created by migration `20260713075210_pro_growth_snapshot`. One row per store per period — latest scrape wins, only where the section produced data (`OK`/`PARTIAL`), Foody only, legacy null-period rows excluded.

```
foody_pro_growth_by_period
  storeId, name, slug,
  periodStart, periodEnd, period_days,   -- 7 = week, 28..31 = month; pick a lane
  scrapedAt, snapshot_id, section_status,
  proBoxFound, proOrders, nonProOrders,
  newVsReturningFound, newCustomerOrders, returningCustomerOrders
```

Base table `"ProGrowthSnapshot"` exists but — as with every KPI — query the view, not the table. Section bookkeeping rides in `SectionResult` under `key = 'proGrowth'` (join via `snapshot_id` if you need failure detail).

---

## 3. What to build

Suggested visualizations, in rough order of value:

1. **Pro adoption card (per store, latest week)** — Pro share as a single percentage with the pro/non-pro split behind it (the portal shows this as a ratio bar; a horizontal stacked bar reads well). Distinct "Not on Foody Pro" state when `proBoxFound = false`.
2. **Pro share trend (per store, weekly)** — line/area of pro share over `periodStart`; overlaying absolute `proOrders` as bars gives share _and_ volume in one chart.
3. **Company-wide Pro penetration** — two numbers: % of stores enrolled (`proBoxFound`), and overall pro order share across enrolled stores (recomputed from sums). A leaderboard of stores by pro share finds under-performers.
4. **New vs. returning doughnut (per store, latest week)** — mirror of the portal's own chart; the new-customer share is effectively an **acquisition rate**, its complement a **retention proxy**. Remember the all-time rule when labeling: a falling new share over time is expected as a store's customer base matures — it is not by itself a decline signal.
5. **Acquisition trend (weekly)** — stacked area of new vs. returning order counts; the new-customer layer is the store's weekly acquisition volume.
6. **Cross-KPI drilldown** — the view joins naturally to the other `*_by_period` views on `("storeId", "periodStart", "periodEnd")`, e.g. "do high-Pro-share stores have better rejection rates?"

---

## 4. Recipes

### Pro adoption card — latest week, one store

```sql
SELECT "periodStart", "periodEnd", "proBoxFound",
       "proOrders", "nonProOrders",
       "proOrders"::float / NULLIF("proOrders" + "nonProOrders", 0) AS pro_share
FROM foody_pro_growth_by_period
WHERE "storeId" = $1 AND period_days = 7
ORDER BY "periodStart" DESC
LIMIT 1;
```

Render "Not on Foody Pro" when `proBoxFound = false` (the counts will be NULL, not 0).

### Weekly pro-share trend (last 12 weeks, one store)

```sql
SELECT "periodStart",
       "proOrders", "nonProOrders",
       "proOrders"::float / NULLIF("proOrders" + "nonProOrders", 0) AS pro_share
FROM foody_pro_growth_by_period
WHERE "storeId" = $1 AND period_days = 7 AND "proBoxFound"
ORDER BY "periodStart" DESC
LIMIT 12;
```

### Company-wide Pro penetration for a week

```sql
SELECT COUNT(*) FILTER (WHERE "proBoxFound")::float / NULLIF(COUNT(*), 0) AS stores_on_pro_pct,
       SUM("proOrders")                                                    AS pro_orders,
       SUM("proOrders")::float
         / NULLIF(SUM("proOrders" + "nonProOrders"), 0)                    AS pro_order_share -- from sums, never AVG of shares
FROM foody_pro_growth_by_period
WHERE period_days = 7 AND "periodStart" = $1;
```

### New vs. returning — latest week, one store

```sql
SELECT "periodStart", "newCustomerOrders", "returningCustomerOrders",
       "newCustomerOrders"::float
         / NULLIF("newCustomerOrders" + "returningCustomerOrders", 0) AS new_share
FROM foody_pro_growth_by_period
WHERE "storeId" = $1 AND period_days = 7
ORDER BY "periodStart" DESC
LIMIT 1;
```

### Acquisition leaderboard for a week (all stores)

```sql
SELECT "storeId", "name", "newCustomerOrders",
       "newCustomerOrders"::float
         / NULLIF("newCustomerOrders" + "returningCustomerOrders", 0) AS new_share
FROM foody_pro_growth_by_period
WHERE period_days = 7 AND "periodStart" = $1
ORDER BY "newCustomerOrders" DESC NULLS LAST;
```

### Cross-KPI join (pro share vs. sales, same week)

```sql
SELECT g."name",
       g."proOrders"::float / NULLIF(g."proOrders" + g."nonProOrders", 0) AS pro_share,
       m.sales, m.orders
FROM foody_pro_growth_by_period g
JOIN foody_metrics_by_period m
  ON m."storeId" = g."storeId"
 AND m."periodStart" = g."periodStart"
 AND m."periodEnd" = g."periodEnd"
WHERE g.period_days = 7 AND g."periodStart" = $1;
```

---

## 5. Prisma notes

All four counts are plain `INTEGER` (no `Decimal` conversions needed, unlike the money columns elsewhere). Same two integration options as the period-queries doc: `$queryRaw` with a typed row, or model the view read-only in your schema copy — this doc's column list is the contract.

---

## 6. Pitfalls checklist

- ❌ Rendering `0` pro orders for a store with `proBoxFound = false` — that store isn't on Pro; the correct UI state is "not enrolled". `NULL` ≠ `0` throughout.
- ❌ Comparing or reconciling `proOrders + nonProOrders`, `newCustomerOrders + returningCustomerOrders`, and `foody_metrics_by_period.orders` — three portal counts, three denominators; shares live within their own block only.
- ❌ `AVG()` of pro share / new share across stores or weeks — recompute from summed numerators and denominators.
- ❌ Mixing `period_days = 7` and `>= 28` rows (same as every other view).
- ❌ Reading a "new customers" decline as churn — the all-time first-order rule means the metric naturally decays as the customer base matures; pair it with absolute acquisition volume.
- ❌ Expecting rows before 2026-07-13 (section didn't exist) or treating a missing store×period row as zeros — check `SectionResult` via `snapshot_id` when you need to distinguish "failed scrape" from "store skipped".

## Questions / changes

Canonical definitions: `prisma/schema.prisma` (`ProGrowthSnapshot`) and `prisma/migrations/20260713075210_pro_growth_snapshot/migration.sql` (exact view SQL). Scraper-side semantics: `src/foody/sections/pro-growth.ts`. Ask us for new columns/views — don't create them in this DB yourselves.
