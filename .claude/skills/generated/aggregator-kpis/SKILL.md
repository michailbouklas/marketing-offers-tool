---
name: aggregator-kpis
description: "Skill for the Aggregator-kpis area of marketing-offers-tool. 57 symbols across 20 files."
---

# Aggregator-kpis

57 symbols | 20 files | Cohesion: 75%

## When to Use

- Working with code in `src/`
- Understanding how load, load, load work
- Modifying aggregator-kpis-related functionality

## Key Files

| File                                                          | Symbols                                                                                                           |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/lib/services/aggregator-kpis/order-rejections.server.ts` | getRejectionsLatestByStore, getRejectionsTrend, getLostSalesByReason, getRejectionsView, toReasonSlices (+4)      |
| `src/lib/services/aggregator-kpis/kpi-shared.server.ts`       | storeWhere, scrapedAtRange, averageByDay, averageOf, parseKpiFilters (+3)                                         |
| `src/lib/services/aggregator-kpis/ratings.server.ts`          | getRatingsLatestByStore, getRatingsTrend, getRatingsDistribution, getRatingsView, points (+1)                     |
| `src/lib/services/aggregator-kpis/closures.server.ts`         | getClosuresLatestByStore, getClosuresTrend, getClosuresView, getClosureReasonBreakdown, getClosuresStoreView (+1) |
| `src/lib/services/aggregator-kpis/punctuality.server.ts`      | getPunctualityLatestByStore, getPunctualityTrend, getPunctualityView, points, getPunctualityStoreView             |
| `src/lib/services/aggregator-kpis/sessions.server.ts`         | rows, parseSessionFilters, startedAtRange, sumByDay, getSessionsView                                              |
| `src/lib/services/aggregator-kpis/reviews.server.ts`          | reviewedAtRange, orderByFor, getReviewStore, listReviews                                                          |
| `src/lib/services/aggregator-kpis/dashboard.server.ts`        | getDashboardStats, countFor                                                                                       |
| `src/routes/aggregator-kpis/reviews/+page.server.ts`          | load                                                                                                              |
| `src/routes/aggregator-kpis/punctuality/+page.server.ts`      | load                                                                                                              |

## Entry Points

Start here when exploring this area:

- **`load`** (Function) — `src/routes/aggregator-kpis/reviews/+page.server.ts:41`
- **`load`** (Function) — `src/routes/aggregator-kpis/punctuality/+page.server.ts:8`
- **`load`** (Function) — `src/routes/aggregator-kpis/ratings/+page.server.ts:8`
- **`load`** (Function) — `src/routes/aggregator-kpis/order-rejections/+page.server.ts:8`
- **`load`** (Function) — `src/routes/aggregator-kpis/closures/+page.server.ts:8`

## Key Symbols

| Symbol                        | Type     | File                                                          | Line |
| ----------------------------- | -------- | ------------------------------------------------------------- | ---- |
| `load`                        | Function | `src/routes/aggregator-kpis/reviews/+page.server.ts`          | 41   |
| `load`                        | Function | `src/routes/aggregator-kpis/punctuality/+page.server.ts`      | 8    |
| `load`                        | Function | `src/routes/aggregator-kpis/ratings/+page.server.ts`          | 8    |
| `load`                        | Function | `src/routes/aggregator-kpis/order-rejections/+page.server.ts` | 8    |
| `load`                        | Function | `src/routes/aggregator-kpis/closures/+page.server.ts`         | 8    |
| `getReviewStore`              | Function | `src/lib/services/aggregator-kpis/reviews.server.ts`          | 94   |
| `listReviews`                 | Function | `src/lib/services/aggregator-kpis/reviews.server.ts`          | 128  |
| `getRatingsLatestByStore`     | Function | `src/lib/services/aggregator-kpis/ratings.server.ts`          | 18   |
| `getRatingsTrend`             | Function | `src/lib/services/aggregator-kpis/ratings.server.ts`          | 60   |
| `getRatingsDistribution`      | Function | `src/lib/services/aggregator-kpis/ratings.server.ts`          | 92   |
| `getRatingsView`              | Function | `src/lib/services/aggregator-kpis/ratings.server.ts`          | 203  |
| `getPunctualityLatestByStore` | Function | `src/lib/services/aggregator-kpis/punctuality.server.ts`      | 17   |
| `getPunctualityTrend`         | Function | `src/lib/services/aggregator-kpis/punctuality.server.ts`      | 66   |
| `getPunctualityView`          | Function | `src/lib/services/aggregator-kpis/punctuality.server.ts`      | 135  |
| `getRejectionsLatestByStore`  | Function | `src/lib/services/aggregator-kpis/order-rejections.server.ts` | 31   |
| `getRejectionsTrend`          | Function | `src/lib/services/aggregator-kpis/order-rejections.server.ts` | 80   |
| `getLostSalesByReason`        | Function | `src/lib/services/aggregator-kpis/order-rejections.server.ts` | 219  |
| `getRejectionsView`           | Function | `src/lib/services/aggregator-kpis/order-rejections.server.ts` | 313  |
| `storeWhere`                  | Function | `src/lib/services/aggregator-kpis/kpi-shared.server.ts`       | 33   |
| `scrapedAtRange`              | Function | `src/lib/services/aggregator-kpis/kpi-shared.server.ts`       | 44   |

## Execution Flows

| Flow                    | Type            | Steps |
| ----------------------- | --------------- | ----- |
| `Load → ToNumber`       | cross_community | 5     |
| `Load → StoreWhere`     | intra_community | 4     |
| `Load → ToNumber`       | cross_community | 4     |
| `Load → ScrapedAtRange` | intra_community | 4     |
| `Load → AverageByDay`   | intra_community | 4     |
| `Load → StoreWhere`     | intra_community | 4     |
| `Load → ToNumber`       | cross_community | 4     |
| `Load → ScrapedAtRange` | intra_community | 4     |
| `Load → AverageByDay`   | intra_community | 4     |
| `Load → StoreWhere`     | intra_community | 4     |

## Connected Areas

| Area     | Connections |
| -------- | ----------- |
| Services | 12 calls    |
| Server   | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "load"})` — see callers and callees
2. `gitnexus_query({query: "aggregator-kpis"})` — find related execution flows
3. Read key files listed above for implementation details
