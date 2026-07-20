# Frontend handoff: querying Wolt period data (Foody-parity)

**Date:** 2026-07-15
**From:** aggregator-merchant-scraper (owns the DB + Prisma migrations)
**To:** frontend/UI team (reads the DB via `MERCHANT_SCRAPES_DATABASE_URL`)
**Companion to:** `frontend-handoff-period-queries.md` (the Foody doc). Everything there — the data model, the dedup design, the three accuracy rules, the Prisma guidance, the pitfalls checklist — applies to Wolt verbatim. This doc covers only what is Wolt-specific: the view names/columns, the extra data Wolt has that Foody doesn't, and the things that look the same but aren't.

## TL;DR

- Wolt lives in the **same tables** as Foody, discriminated by `Store.aggregator = 'WOLT'`. Same period model: `periodStart`/`periodEnd` = previous completed Mon–Sun week or previous calendar month, identical calendar math to Foody — so a Wolt week row and a Foody week row for the same period have **the same `periodStart`/`periodEnd`** and can sit side by side in one comparison UI.
- Query the **`wolt_*_by_period` views**, never the base tables. They are structured 1:1 like the `foody_*_by_period` views: latest snapshot per `(storeId, periodStart, periodEnd)` where the KPI child exists, legacy/unpinned rows excluded. Every Foody recipe in the companion doc works by swapping the view name (column differences below).
- All three Foody accuracy rules apply unchanged: never mix `period_days = 7` with `>= 28`; recompute ratios from sums; never aggregate cumulative values.
- Two Wolt-only concepts to render correctly: **portal delta columns** (display-only, never math) and **per-day child tables** (`ClosureDay`, `RejectionDay` — chart-decoded approximations, great for sparklines, label as approximate).

---

## 1. View ↔ view mapping (build one screen, feed it either aggregator)

| Foody view                    | Wolt view                   | Same-named columns                                                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | --------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `foody_metrics_by_period`     | `wolt_metrics_by_period`    | `sales`, `orders`, `avgBasketSize`, `avgBasketItems`, `completedOrders` | Wolt adds `salesDeltaPct`, `ordersDeltaPct`, `avgBasketSizeDeltaPct`, `avgBasketItemsDeltaPct`, `comparison_window` (§3). ⚠️ `completedOrders` caveat in §4.                                                                                                                                                                                                                                                                              |
| `foody_closures_by_period`    | `wolt_closures_by_period`   | — (renamed, see below)                                                  | Wolt exposes `unavailable_seconds`, `unavailable_raw`, `unavailable_pct`, `loss_amount`, `unavailable_delta_pct`, `unavailable_pct_delta_pct`, `loss_delta_pct`, `comparison_window`, `closures_id`. Semantics: `unavailable_seconds` ≙ Foody's `offlineDurationSeconds`, `unavailable_pct` ≙ `offlineOpenHoursPct`. `loss_amount` (€ lost to unavailability) has **no Foody equivalent**. Foody's `unreachable*` has no Wolt equivalent. |
| `foody_rejections_by_period`  | `wolt_rejections_by_period` | — (renamed, see below)                                                  | `avoidable_rejections` ≙ Foody's `cancellationsCount`, `avoidable_rejections_pct` ≙ `cancellationsPct`, `loss_amount` ≙ `lostSales`. Wolt adds `late_orders_pct(+_delta_pct)`, `prep_time_seconds`/`prep_time_raw(+_delta_pct)`, `prepared_later_count(+_delta_pct)`, `comparison_window`, `rejections_id`. Foody's `reasonUnknownCount` has no Wolt equivalent.                                                                          |
| `foody_punctuality_by_period` | **none**                    |                                                                         | Wolt has no separate punctuality section. The closest analogs — late-orders rate and preparation time — live on `wolt_rejections_by_period` (that's where the portal shows them).                                                                                                                                                                                                                                                         |
| `foody_rating_latest`         | **none yet**                |                                                                         | Ratings/reviews are not scraped for Wolt yet. Hide or grey out those widgets for Wolt stores.                                                                                                                                                                                                                                                                                                                                             |

All Wolt views also carry the standard identity columns: `storeId`, `name`, `slug`, `periodStart`, `periodEnd`, `period_days`, `scrapedAt`, `snapshot_id`, `section_status`.

Child tables (join key = the `*_id` column on the view):

| View column                               | Child table                                          | Rows mean                                                                                                                                                                                                                                                                    |
| ----------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wolt_closures_by_period.closures_id`     | `"ClosureDay"` (`closuresSnapshotId`)                | One decoded day: `date`, `appNotLiveSeconds`, `manualOfflineSeconds`, `lossAmount`. A `(0, 0)` row is a **real zero-closure day**; no rows at all means the chart never rendered that scrape.                                                                                |
| `wolt_rejections_by_period.rejections_id` | `"RejectionDay"` (`orderRejectionsSnapshotId`)       | One decoded day: `date`, `autoRejected`, `activelyRejected`, `lossAmount`. **Only days with rejections produce rows** — an absent date inside the period is a real zero, render it as 0.                                                                                     |
| `wolt_rejections_by_period.rejections_id` | `"CancellationReason"` (`orderRejectionsSnapshotId`) | Rejection-reason rows, e.g. `("Auto rejection - 3 minutes", cancellations=1)`. Same table Foody uses, but for Wolt `salesLoss`/`salesLossRaw` are always NULL (the portal doesn't break loss down per reason). Reason labels are portal-defined free text — don't enum them. |
| (Foody only) `"ClosureReason"`            |                                                      | Foody's closure-reason carousel. **Always empty for Wolt** — Wolt's breakdown is per-day (`ClosureDay`), not per-reason.                                                                                                                                                     |

---

## 2. What you can build

**Everything the Foody screens do, 1:1.** KPI cards for the latest completed week, weekly trend charts, exact month rows, company-wide aggregates, reason breakdowns — every recipe in the Foody doc §4 works with the view name swapped (and the renamed columns above). One point per store per period is guaranteed by the views.

**Direct Foody-vs-Wolt comparison for a merchant.** Periods align exactly (same Mon–Sun weeks, same calendar months), so a side-by-side is a join on `(periodStart, periodEnd)`:

```sql
SELECT f."periodStart", f.sales AS foody_sales, w.sales AS wolt_sales
FROM foody_metrics_by_period f
JOIN wolt_metrics_by_period  w
  ON w."periodStart" = f."periodStart" AND w."periodEnd" = f."periodEnd"
WHERE f."storeId" = $1 AND w."storeId" = $2 AND f.period_days = 7
ORDER BY f."periodStart" DESC LIMIT 12;
```

⚠️ **There is no cross-aggregator merchant mapping in this DB.** A physical restaurant is one `Store` row per aggregator (`FOODY` + `WOLT`) with unrelated `externalId`s and possibly different display names. The `$1`/`$2` pairing above is yours to own (a mapping table on your side, or name matching you control).

**Per-day drill-downs Foody can't do.** Wolt's Operations charts give per-day unavailability (split into "app not live" vs "manually put offline") and per-day rejections (auto vs actively rejected), each with a per-day € loss. Good fits: a 7-bar mini chart inside the closures/rejections card, a "which day did we lose money" tooltip, a month heatmap.

```sql
-- Per-day unavailability for a store's latest completed week
SELECT d.date, d."appNotLiveSeconds", d."manualOfflineSeconds", d."lossAmount"
FROM wolt_closures_by_period v
JOIN "ClosureDay" d ON d."closuresSnapshotId" = v.closures_id
WHERE v."storeId" = $1 AND v.period_days = 7
  AND v."periodStart" = (SELECT MAX("periodStart") FROM wolt_closures_by_period
                         WHERE "storeId" = $1 AND period_days = 7)
ORDER BY d.date;
```

**"Money lost to operations" rollup** — Wolt quantifies both loss streams in €:

```sql
SELECT c."storeId", c."name",
       c.loss_amount AS loss_from_unavailability,
       r.loss_amount AS loss_from_rejections
FROM wolt_closures_by_period c
JOIN wolt_rejections_by_period r
  ON r."storeId" = c."storeId"
 AND r."periodStart" = c."periodStart" AND r."periodEnd" = c."periodEnd"
WHERE c.period_days = 7 AND c."periodStart" = $1;
```

---

## 3. Wolt-only: the portal delta columns (display, never math)

Every `*DeltaPct` / `*_delta_pct` column plus `comparison_window` is **Wolt's own on-page comparison**, captured verbatim: "sales −7% vs 6 days". Rules:

- Render as a badge next to the value ("−7% vs 6 days"), sign included. `comparison_window` is Wolt-chosen free text (`"6 days"`, historically `"8w, 4d"`) — display it, don't parse it.
- **Never** aggregate deltas (no AVG/SUM across stores or periods), never derive numbers from them, never mix them with your own period-over-period math. If you want a true WoW change, compute it from two adjacent period rows — exactly as you would for Foody.
- Deltas can be NULL while the value is present (the portal sometimes omits them, e.g. the rejections count/loss cells).

---

## 4. Things that look like Foody but differ

1. **Store identity.** `Store.externalId` for Wolt is the **venue URL slug** (e.g. `pizza-hut-strovolos`), not a vendor id. If a venue is renamed on Wolt's side the slug changes and a **new Store row appears** — history doesn't migrate. Rare (hand-maintained venue list), but don't assume storeId permanence across renames.
2. **`completedOrders` is not period data.** On Foody-shaped screens `completedOrders` rides along in the metrics view; for Wolt it is the venue-home "Completed orders" figure, which is **today-scoped at scrape time** (live recon: 9 on home vs 327 weekly). Never show it next to period numbers as if comparable; either hide it for Wolt or label it "today at scrape time".
3. **Per-day values are approximations.** `ClosureDay`/`RejectionDay` are decoded from chart pixel geometry, not portal text. Accuracy is good (validated to the cent / to the minute against headline totals) but not contractual — the headline columns on the views are the authoritative numbers. If a per-day sum and a headline disagree slightly, the headline wins; label per-day charts "approx." if you show absolute values.
4. **Zero vs missing, per table.** `ClosureDay`: every period day gets a row (0/0 = real zero). `RejectionDay`: only rejection days get rows (absent = real zero). In both cases _no child rows at all AND `section_status = 'PARTIAL'`_ usually means the chart failed to render that scrape — check `missingFields` on `SectionResult` (`'perDayChart'`) via `snapshot_id` before rendering an empty chart as "no incidents".
5. **`section_status` granularity.** Same OK/PARTIAL/FAILED semantics as Foody, but Wolt's rejections section has 7 fixed cells — PARTIAL is common if one detail card lags. Values that did parse are still trustworthy; NULL columns are "didn't render", not zero.
6. **Data availability.** Wolt metrics rows exist from 2026-07-13; closures/rejections landed 2026-07-14/15 and their first production rows arrive with the next successful scrape run (currently pending an infra fix on the login email path). Older Wolt snapshots simply won't appear in the closures/rejections views — that's the "latest where the child exists" pattern working as intended, not data loss. Build the screens to tolerate a store having metrics but no closures/rejections rows for older periods.
7. **Naming inconsistencies to be aware of:** `wolt_metrics_by_period` kept the camelCase quoted column names (`"avgBasketSize"`, `"salesDeltaPct"`), while `wolt_closures_by_period` / `wolt_rejections_by_period` use snake_case aliases (`unavailable_seconds`, `late_orders_pct`). Also, the child-join key is `closures_id` / `rejections_id` on the Wolt views but `closures_snapshot_id` / `rejections_snapshot_id` on the Foody ones — a shared query builder must parameterize that name. Match the columns exactly as listed in §1.

---

## 5. Pitfalls (Wolt additions to the Foody checklist)

Everything in the Foody doc §6 applies. Additionally:

- ❌ Aggregating any `*DeltaPct` column or comparing it to your own computed change.
- ❌ Treating `completedOrders` as a period figure for Wolt.
- ❌ Rendering "no `RejectionDay` rows" as "no data" — for an OK-status snapshot it means zero rejections.
- ❌ Summing `ClosureDay`/`RejectionDay` values across period kinds (same week/month rule as everything else — the child rows inherit the parent view row's period).
- ❌ Joining Foody and Wolt stores by `name` equality without your own mapping — display names differ between portals.
- ❌ Expecting `ClosureReason` rows for Wolt or `ClosureDay`/`RejectionDay`/delta columns for Foody — each is one-aggregator-only; the shared tables just hold NULL/empty for the other.

## Questions / changes

Canonical definitions: `prisma/schema.prisma` and the view SQL in
`prisma/migrations/20260713125509_wolt_metrics_by_period_view/`,
`prisma/migrations/20260714123522_wolt_closures_by_period_view/`,
`prisma/migrations/20260715075312_wolt_rejections_by_period_view/`.
Scraper-side data shapes (what feeds the tables): `src/wolt/types.ts`, spec at
`docs/specs/wolt-closures-section.md`. If you need another column exposed in a
view, ask us — don't create views in this DB yourselves.
