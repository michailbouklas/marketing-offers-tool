# Frontend handoff: operations reason breakdowns + semantics fix

**Date:** 2026-07-09
**From:** aggregator-merchant-scraper (owns the DB + Prisma migrations)
**To:** frontend team (reads the DB via `MERCHANT_SCRAPES_DATABASE_URL`)
**DB migration:** `20260709080610_operations_reason_breakdowns` (already applied)
**Prior handoff:** `frontend-handoff-historical-data.md` — everything there still holds.

## TL;DR

The Foody "Operations" data got richer and more truthful. Three things to act on:

1. **Resync your schema copy + `prisma generate`** — unlike the last handoff,
   this change adds tables and columns, so your generated client types DO
   change. Nothing breaks until you resync, but you can't see the new data.
2. **Null vs zero semantics changed on two existing columns**
   (`unreachableSeconds`, `reasonUnknownCount`): going forward `0` means
   "genuinely zero" and `null` means "not captured". Historic rows are almost
   all `null`. Render `null` as "—", never as 0.
3. **New per-reason breakdown tables** (`ClosureReason`,
   `CancellationReason`) enable the most useful new visual: _why_ orders were
   cancelled and _why_ the store was offline, per snapshot and over time.
   Reason rows only exist from 2026-07-09 onward — gate breakdown charts on
   data presence, not on the store existing.

---

## What changed in the schema (all additive)

```
ClosuresSnapshot
  + offlineDurationSeconds Int?     -- headline "2d 6h" -> 194400
  + offlineDurationRaw     String?  -- original display string
  + reasons ClosureReason[]         -- NEW child table

ClosureReason                       -- one row per closure reason that occurred
  closuresSnapshotId -> ClosuresSnapshot (cascade)
  reason          String            -- "Closed", "Unreachable", … (free text)
  durationSeconds Int?
  durationRaw     String?

OrderRejectionsSnapshot
  + cancellationsCount Int?         -- headline count next to the percent (e.g. 15)
  + reasons CancellationReason[]    -- NEW child table

CancellationReason                  -- one row per cancellation reason that occurred
  orderRejectionsSnapshotId -> OrderRejectionsSnapshot (cascade)
  reason        String              -- "Items Unavailable", "Technical Problem", … (free text)
  cancellations Int?                -- e.g. 5
  salesLoss     Decimal?            -- e.g. 343.20
  salesLossRaw  String?             -- e.g. "€343.2 sales loss"
```

Both child tables are indexed on their FK; cascade-deleted with the snapshot.

## Why (context you need to visualize correctly)

The Foody portal breaks these KPIs down **by reason, in a carousel with one
slide per reason that actually occurred**. The old scraper modeled two of
those slides ("Unreachable", "Reason unknown") as fixed fields, so they were
null on ~90% of stores and every store's operations section rated "partial".
The scraper now captures the whole carousel, and the fixed fields are derived
from it.

**The single most important consequence for the UI: an absent reason row
means "this reason did not occur in the window" — a true zero — not missing
data.** A store with zero cancellations legitimately has an empty `reasons`
list.

---

## Action items

### 1. Resync + regenerate (required to see anything new)

Copy the canonical `prisma/schema.prisma` changes into your
`prisma/merchant-scrapes/schema.prisma` and run `prisma generate`. (And if the
`BOLT` enum drift from the previous handoff is still unfixed, fix it in the
same pass.)

### 2. Null vs zero — update how you render two existing columns

| Column                                       | Before 2026-07-09                   | After                                                                                                                  |
| -------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ClosuresSnapshot.unreachableSeconds`        | `null` ≈ always (meaning _unknown_) | `0` = genuinely zero; a value = the "Unreachable" reason's duration; `null` = card never rendered (extraction failure) |
| `OrderRejectionsSnapshot.reasonUnknownCount` | `null` ≈ always                     | `0` = genuinely zero; `null` = extraction failure                                                                      |

Rule of thumb for all KPI columns in this DB: **`null` renders as "—"
(no data), `0` renders as 0.** Historic nulls should not be charted as zeros
in trend lines — break the line instead (most chart libs: `connectNulls:
false`).

### 3. The new visuals this unlocks (suggested)

- **Cancellation reasons, per store** — stacked bar or donut of
  `CancellationReason.cancellations` (or `salesLoss` for a €-weighted view)
  for the latest snapshot. Sort slices by count desc. Reason strings are
  **free text from the portal, not an enum** — new reasons can appear any
  run, some are long ("Customer cancelled; Order took longer than
  expected") — so derive the legend from data and truncate with tooltips.
- **Cancellation reasons over time** — stacked area/bar over `scrapedAt`
  (one series per reason). Start the chart at the first snapshot that has
  reason data (see cutover note below).
- **"Lost sales by reason" across stores** — the cross-store aggregation this
  was designed for: join `CancellationReason` → `OrderRejectionsSnapshot` →
  `ScrapeSnapshot` (latest per store) → `Store`, group by `reason`, sum
  `salesLoss`.
- **New headline tile:** `cancellationsCount` next to the existing
  `cancellationsPct` and `lostSales` ("15 cancellations · 3.23% · €636.24").
- **Closures:** headline `offlineDurationSeconds` (format as `2d 6h`-style;
  `offlineDurationRaw` is the portal's own formatting if you'd rather not
  format seconds yourself) plus a small breakdown list from `ClosureReason`
  ("Closed 2d 2h · Unreachable 4h").

### 4. Totals: use the headline columns, not sums of reasons

`SUM(reasons.cancellations)` matched the headline `cancellationsCount` in our
verification, but treat the headline columns (`cancellationsCount`,
`lostSales`, `offlineDurationSeconds`) as authoritative totals and the reason
rows as the split. Don't compute totals by summing children (rounding and
portal quirks are absorbed upstream).

### 5. Cutover: reason data starts 2026-07-09

Snapshots written before the first post-hardening run have **no reason rows
and null `offlineDurationRaw`/`cancellationsCount`** — that's "not captured",
not "zero closures forever". For breakdown/trend views, gate on data
presence (e.g. `offlineDurationRaw IS NOT NULL`, or reason rows existing, or
`scrapedAt >= '2026-07-09'`) rather than rendering empty charts for history.

### 6. Section status: "partial" changes meaning (dashboard/status views)

If you surface `SectionResult.status` anywhere: historically the operations
section was `PARTIAL` on essentially every store (an assessment bug — the
conditional carousel slides were counted as required). From the first
post-hardening run, `OK` is the norm and `PARTIAL`/`FAILED` signal a real
extraction problem. Don't flag pre-2026-07-09 `PARTIAL` operations rows as a
data-quality regression — that's the old semantics.

The existing "latest snapshot **where the child exists**" query pattern from
the previous handoff stays exactly right; the new children ride along via
`include: { reasons: true }` on the closures/rejections child.

### 7. Minor caveat on historic `lostSales`

A small number of historic `OrderRejectionsSnapshot.lostSales` values (only
where the display string failed to parse and a numeric fallback was used) may
carry a first-reason-only figure instead of the true total. Post-hardening
values are correct. Not worth remediation — just don't be surprised by an
odd historic outlier in €-trend lines.
