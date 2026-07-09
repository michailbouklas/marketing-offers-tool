# Frontend handoff: scrape health — `ScrapeRun.sectionDiagnostics` + `SectionResult.attempts`

**Date:** 2026-07-09
**From:** aggregator-merchant-scraper (owns the DB + Prisma migrations)
**To:** frontend team (reads the DB via Prisma through `MERCHANT_SCRAPES_DATABASE_URL`)
**DB migrations:** `20260709094151_section_result_attempts`,
`20260709094930_scrape_run_section_diagnostics` (both applied, additive)
**Prior handoffs:** `frontend-handoff-historical-data.md`,
`frontend-handoff-operations-breakdowns.md` — everything there still holds.
**Scraper-side detail:** `foody-retry-and-diagnostics.md`.

## TL;DR

Two additive columns turn the sessions view from "a run happened, N stores were
partial" into a **scrape-health / data-quality** surface: you can now show, per
run, _which section is non-ok, on how many stores, and why_ — and, per store,
_whether a retry recovered it_.

Three things to act on:

1. **Resync your schema copy + `prisma generate`.** Unlike the index-only
   handoff, this adds a scalar column and a `Json?` column, so the generated
   client types change. Reads keep working until you resync, but you can't see
   the new fields typed.
2. **`sectionDiagnostics` is `Json?`** — Prisma won't type its interior. Define
   a TS type on your side (given below) and treat all label strings as **free
   text** (derive legends from data, truncate + tooltip).
3. **Null / default for history:** `sectionDiagnostics` is `null` for sessions
   finalized before this shipped; `attempts` defaults to `1` on every historic
   `SectionResult`. Render `null` diagnostics as "not captured," never as empty
   charts or zeros.

---

## What changed in the schema (all additive)

```
ScrapeRun
  + sectionDiagnostics Json?   -- one end-of-session per-section rollup per run

SectionResult
  + attempts Int @default(1)   -- times this section was extracted (>1 = retried)
```

Nothing was removed or renamed. The `ScrapeRun` headline counters
(`okStores/partialStores/failedStores/skippedStores`, `totalStores`) and
`SectionResult.status/error/missingFields/durationMs` are unchanged.

---

## `sectionDiagnostics` shape

Written at session finalize (supervised runs) and refreshed by the standalone
retry command. Mirror it as:

```ts
type LabeledCount = { label: string; count: number };

type SectionStatusTally = {
  ok: number;
  partial: number;
  failed: number;
  skipped: number;
};

type SectionDiagnostic = {
  key: string; // "metrics" | "rating" | "reviews" | "operations" | future
  total: number; // stores that recorded this section
  status: SectionStatusTally; // per-status store counts (sums to `total`)
  missingFields: LabeledCount[]; // dominant missing fields, count desc (free text labels)
  errors: LabeledCount[]; // distinct error messages, count desc (free text)
};

type ManifestDiagnostics = {
  runId: string;
  shard: string | null; // "2/3" | null
  generatedAt: string; // ISO timestamp of the diagnosis
  totalStores: number; // the run's declared store count
  recordedStores: number; // stores attempted at least once
  switchedStores: number; // store switch succeeded
  switchFailedStores: number; // store switch failed → nothing scraped
  retryCandidates: number; // stores with >=1 failed/partial section
  retriedStores: number; // stores extracted more than once
  sections: SectionDiagnostic[]; // ordered metrics, rating, reviews, operations
};
```

> Read `runId` to join a session's diagnostics to its `ScrapeSnapshot`s
> (`ScrapeSnapshot.runId`) when you want to drill from the rollup to the stores.

---

## What you can build

### On the sessions view (per run)

- **Per-section health bar** straight from `sections[].status` — e.g. a stacked
  bar "operations: 220 ok / 14 partial / 2 failed / 10 skipped". No aggregation
  query needed; the split is precomputed.
- **"Top reasons" panel** from `sections[].missingFields` / `.errors` (already
  ranked desc): "operations partial — `orderRejections.cardFound` ×14,
  `punctuality.cardFound` ×9". This is the durable _why_ a section was non-ok.
- **Session composition tiles**: `switchedStores`, `switchFailedStores`,
  `retryCandidates`, `retriedStores` — e.g. "8 stores non-ok · 6 recovered on
  retry."

### Trends across runs (order by `scrapedAt` / session `startedAt`)

- **Partial-rate per section over time** — `partial / total` per run as a line
  or area. This is the headline data-quality signal; a spike flags portal drift
  the moment it happens. Break the line on `null` (legacy sessions), don't plot 0.
- **Missing-field drift** — stacked series of the top `missingFields[].label`
  counts across runs; a label that suddenly appears everywhere is a
  page-structure change, not per-store variance.

### Per-store drill-down (from `SectionResult`, joined via `ScrapeSnapshot → Store`)

- **"Recovered by retry"**: sections with `attempts > 1` that ended `OK` vs
  those still `PARTIAL`/`FAILED` — separates transient misses from real bugs.
- **"Needs attention" list**: stores whose section is still `PARTIAL`/`FAILED`
  with `attempts >= 2`, plus that row's `missingFields` / `error`. These are the
  stubborn cases worth a scraper fix, now identifiable by store name.
- **Cost view**: distribution of `attempts` (and existing `durationMs`) per
  section to spot expensive-but-still-failing sections.

---

## Semantics & gotchas

- **`attempts` meaning:** `1` = extracted once (the normal path). `> 1` = the
  end-of-session retry pass re-ran this section (see
  `foody-retry-and-diagnostics.md`). Historic rows are all `1` — that's "not
  retried," not "retried once and failed."
- **`missingFields` / `errors` labels are free text**, not enums. New labels can
  appear any run; some are long (e.g. dotted paths like
  `punctuality.deliveredOrders.total`, or portal error strings). Derive legends
  from data; truncate with tooltips.
- **`skipped` in a tally** = the store's switch failed, so no section ran — it is
  **not** a data-quality signal about that section. Chart `partial`+`failed`
  for "extraction problems," and surface `switchFailedStores` separately.
- **Totals:** trust the `ScrapeRun` headline counters
  (`okStores/partialStores/...`) as the authoritative per-run store totals;
  `sectionDiagnostics.sections[].status` is the _per-section_ split. Don't derive
  one from the other.
- **`operations` `partial` history caveat** (carried over): pre-2026-07-09
  `operations` was `PARTIAL` on nearly every store due to the old assessment
  bug. Don't chart that as a regression against post-hardening runs — the
  semantics changed. `sectionDiagnostics` only exists from this ship date
  onward, so a diagnostics-based trend naturally starts clean.

---

## Out of scope

No change to KPI child tables, `Review`, `Store`, or the separate
`SCRAPER_DATABASE_URL` operational DB. This is purely additive scrape-health
metadata on the run/section bookkeeping tables.
