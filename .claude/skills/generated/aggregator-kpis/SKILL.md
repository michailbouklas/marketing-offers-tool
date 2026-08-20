---
name: aggregator-kpis
description: "Skill for the Aggregator-kpis area of marketing-offers-tool. 126 symbols across 26 files."
---

# Aggregator-kpis

126 symbols | 26 files | Cohesion: 68%

## When to Use

- Working with code in `src/`
- Understanding how getPunctualityPeriodView, getPunctualityPeriodStoreView, periodDaysSql work
- Modifying aggregator-kpis-related functionality

## Key Files

| File                                                          | Symbols                                                                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/services/aggregator-kpis/order-rejections.server.ts` | getRejectionsPeriodTrend, getRejectionsLatestPeriodRows, getRejectionsPeriodHistory, getRejectionsLostSalesByReasonPeriod, getWoltRejectionsPeriodTrend (+16) |
| `src/lib/services/aggregator-kpis/closures.server.ts`         | getClosuresPeriodTrend, getClosuresLatestPeriodRows, getClosuresPeriodHistory, getWoltClosuresPeriodTrend, getWoltClosuresLatestPeriodRows (+12)              |
| `src/lib/services/aggregator-kpis/punctuality.server.ts`      | getPunctualityPeriodTrend, getPunctualityLatestPeriodRows, getPunctualityPeriodHistory, getPunctualityPeriodView, getPunctualityPeriodStoreView (+6)          |
| `src/lib/services/aggregator-kpis/metrics.server.ts`          | periodSumTrends, latestPeriodRows, totalsFromRows, woltPeriodSumTrends, woltLatestPeriodRows (+6)                                                             |
| `src/lib/services/aggregator-kpis/pro-growth.server.ts`       | getProGrowthLatestPeriodRows, mapProGrowthPeriodRow, getProGrowthLatestRows, getProGrowthPeriodHistory, mapShareTrend (+4)                                    |
| `src/lib/services/aggregator-kpis/ratings.server.ts`          | points, getRatingsLatestByStore, getRatingsTrend, getRatingsDistribution, getRatingsView (+4)                                                                 |
| `src/lib/services/aggregator-kpis/sessions.server.ts`         | sections, rows, toSessionRow, getSessionDetail, startedAtRange (+2)                                                                                           |
| `src/lib/services/aggregator-kpis/kpi-shared.server.ts`       | toNumber, averageOf, getKpiStore, storeWhere, scrapedAtRange (+2)                                                                                             |
| `src/lib/services/aggregator-kpis/aggregator-kpis.ts`         | proOrderShare, parseSectionDiagnostics, deriveStoreOutcome, sectionKeyLabel, buildSectionHealthTrend (+2)                                                     |
| `src/lib/services/aggregator-kpis/reviews.server.ts`          | reviewedAtRange, orderByFor, getReviewStore, listReviews, toOrderDetails (+1)                                                                                 |

## Entry Points

Start here when exploring this area:

- **`getPunctualityPeriodView`** (Function) — `src/lib/services/aggregator-kpis/punctuality.server.ts:288`
- **`getPunctualityPeriodStoreView`** (Function) — `src/lib/services/aggregator-kpis/punctuality.server.ts:300`
- **`periodDaysSql`** (Function) — `src/lib/services/aggregator-kpis/period-shared.server.ts:39`
- **`storeFilterSql`** (Function) — `src/lib/services/aggregator-kpis/period-shared.server.ts:50`
- **`getRejectionsPeriodView`** (Function) — `src/lib/services/aggregator-kpis/order-rejections.server.ts:708`

## Key Symbols

| Symbol                           | Type     | File                                                          | Line |
| -------------------------------- | -------- | ------------------------------------------------------------- | ---- |
| `getPunctualityPeriodView`       | Function | `src/lib/services/aggregator-kpis/punctuality.server.ts`      | 288  |
| `getPunctualityPeriodStoreView`  | Function | `src/lib/services/aggregator-kpis/punctuality.server.ts`      | 300  |
| `periodDaysSql`                  | Function | `src/lib/services/aggregator-kpis/period-shared.server.ts`    | 39   |
| `storeFilterSql`                 | Function | `src/lib/services/aggregator-kpis/period-shared.server.ts`    | 50   |
| `getRejectionsPeriodView`        | Function | `src/lib/services/aggregator-kpis/order-rejections.server.ts` | 708  |
| `getRejectionsPeriodStoreView`   | Function | `src/lib/services/aggregator-kpis/order-rejections.server.ts` | 740  |
| `getMetricsView`                 | Function | `src/lib/services/aggregator-kpis/metrics.server.ts`          | 297  |
| `getClosuresPeriodView`          | Function | `src/lib/services/aggregator-kpis/closures.server.ts`         | 532  |
| `getClosuresPeriodStoreView`     | Function | `src/lib/services/aggregator-kpis/closures.server.ts`         | 555  |
| `sections`                       | Function | `src/lib/services/aggregator-kpis/sessions.server.ts`         | 376  |
| `points`                         | Function | `src/lib/services/aggregator-kpis/ratings.server.ts`          | 164  |
| `points`                         | Function | `src/lib/services/aggregator-kpis/punctuality.server.ts`      | 127  |
| `getCancellationReasonBreakdown` | Function | `src/lib/services/aggregator-kpis/order-rejections.server.ts` | 129  |
| `getCancellationReasonTrend`     | Function | `src/lib/services/aggregator-kpis/order-rejections.server.ts` | 175  |
| `points`                         | Function | `src/lib/services/aggregator-kpis/order-rejections.server.ts` | 210  |
| `getRejectionsStoreView`         | Function | `src/lib/services/aggregator-kpis/order-rejections.server.ts` | 287  |
| `toNumber`                       | Function | `src/lib/services/aggregator-kpis/kpi-shared.server.ts`       | 22   |
| `getClosureReasonBreakdown`      | Function | `src/lib/services/aggregator-kpis/closures.server.ts`         | 115  |
| `getClosuresStoreView`           | Function | `src/lib/services/aggregator-kpis/closures.server.ts`         | 158  |
| `points`                         | Function | `src/lib/services/aggregator-kpis/closures.server.ts`         | 176  |

## Execution Flows

| Flow                    | Type            | Steps |
| ----------------------- | --------------- | ----- |
| `Load → ToNumber`       | cross_community | 5     |
| `Load → PeriodDaysSql`  | cross_community | 4     |
| `Load → StoreFilterSql` | cross_community | 4     |
| `Load → ToNumber`       | cross_community | 4     |
| `Load → PeriodDaysSql`  | cross_community | 4     |
| `Load → StoreFilterSql` | cross_community | 4     |
| `Load → ToNumber`       | cross_community | 4     |
| `Load → PeriodDaysSql`  | cross_community | 4     |
| `Load → StoreFilterSql` | cross_community | 4     |
| `Load → ToNumber`       | cross_community | 4     |

## Connected Areas

| Area        | Connections |
| ----------- | ----------- |
| Services    | 12 calls    |
| Punctuality | 4 calls     |
| Server      | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "getPunctualityPeriodView"})` — see callers and callees
2. `gitnexus_query({query: "aggregator-kpis"})` — find related execution flows
3. Read key files listed above for implementation details
