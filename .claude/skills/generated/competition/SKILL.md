---
name: competition
description: "Skill for the Competition area of marketing-offers-tool. 56 symbols across 14 files."
---

# Competition

56 symbols | 14 files | Cohesion: 68%

## When to Use

- Working with code in `src/`
- Understanding how load, getCompetitionDatabase, getCompetitionCurrency work
- Modifying competition-related functionality

## Key Files

| File                                                                       | Symbols                                                                                                                          |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/services/competition/scrape-job.server.ts`                        | ScrapeAlreadyRunningError, ScrapeConfigError, startScrape, getJob, isScrapeRunning (+7)                                          |
| `src/lib/services/competition/restaurants.server.ts`                       | fetchActiveOfferCounts, items, groupMenuRows, computeTransitions, groupTimeSeriesRows (+6)                                       |
| `src/lib/services/competition/offers.server.ts`                            | fetchLatestPrices, parseMonitoredRestaurantKeys, buildRestaurantPairClause, buildRestaurantPairParams, buildEmptyOffersPage (+4) |
| `src/lib/server/competition-db.ts`                                         | getCompetitionDatabase, getCompetitionCurrency, competitionTable, parseCount, utcIsoExpression (+3)                              |
| `src/lib/services/competition/active-offers-timeseries.server.ts`          | toUtcDayKey, getLastUtcDayKeys, buildSeries, getActiveOffersByDayByAggregator                                                    |
| `src/lib/services/competition/dashboard.server.ts`                         | getDashboardStats, activeOffersByProcessor, recentChanges                                                                        |
| `src/lib/services/competition/scrape-sessions.server.ts`                   | getSafePagination, listScrapeSessionsPage                                                                                        |
| `src/routes/competition/+page.server.ts`                                   | load                                                                                                                             |
| `src/routes/api/competition/active-offers-by-day-by-aggregator/+server.ts` | GET                                                                                                                              |
| `src/lib/server/env.ts`                                                    | getRemoteScraperUrl                                                                                                              |

## Entry Points

Start here when exploring this area:

- **`load`** (Function) — `src/routes/competition/+page.server.ts:5`
- **`getCompetitionDatabase`** (Function) — `src/lib/server/competition-db.ts:31`
- **`getCompetitionCurrency`** (Function) — `src/lib/server/competition-db.ts:57`
- **`competitionTable`** (Function) — `src/lib/server/competition-db.ts:73`
- **`parseCount`** (Function) — `src/lib/server/competition-db.ts:120`

## Key Symbols

| Symbol                             | Type     | File                                                                       | Line |
| ---------------------------------- | -------- | -------------------------------------------------------------------------- | ---- |
| `ScrapeAlreadyRunningError`        | Class    | `src/lib/services/competition/scrape-job.server.ts`                        | 71   |
| `ScrapeConfigError`                | Class    | `src/lib/services/competition/scrape-job.server.ts`                        | 78   |
| `load`                             | Function | `src/routes/competition/+page.server.ts`                                   | 5    |
| `getCompetitionDatabase`           | Function | `src/lib/server/competition-db.ts`                                         | 31   |
| `getCompetitionCurrency`           | Function | `src/lib/server/competition-db.ts`                                         | 57   |
| `competitionTable`                 | Function | `src/lib/server/competition-db.ts`                                         | 73   |
| `parseCount`                       | Function | `src/lib/server/competition-db.ts`                                         | 120  |
| `utcIsoExpression`                 | Function | `src/lib/server/competition-db.ts`                                         | 144  |
| `listScrapeSessionsPage`           | Function | `src/lib/services/competition/scrape-sessions.server.ts`                   | 75   |
| `getDashboardStats`                | Function | `src/lib/services/competition/dashboard.server.ts`                         | 41   |
| `activeOffersByProcessor`          | Function | `src/lib/services/competition/dashboard.server.ts`                         | 116  |
| `getActiveOffersByDayByAggregator` | Function | `src/lib/services/competition/active-offers-timeseries.server.ts`          | 52   |
| `GET`                              | Function | `src/routes/api/competition/active-offers-by-day-by-aggregator/+server.ts` | 5    |
| `latestProductPriceSubquery`       | Function | `src/lib/server/competition-db.ts`                                         | 90   |
| `parseNullableNumber`              | Function | `src/lib/server/competition-db.ts`                                         | 100  |
| `items`                            | Function | `src/lib/services/competition/restaurants.server.ts`                       | 215  |
| `getRestaurantDetail`              | Function | `src/lib/services/competition/restaurants.server.ts`                       | 334  |
| `activeOffers`                     | Function | `src/lib/services/competition/restaurants.server.ts`                       | 475  |
| `recentChanges`                    | Function | `src/lib/services/competition/dashboard.server.ts`                         | 125  |
| `listActiveOffersPage`             | Function | `src/lib/services/competition/offers.server.ts`                            | 262  |

## Execution Flows

| Flow                            | Type            | Steps |
| ------------------------------- | --------------- | ----- |
| `Load → LoadEnvFileValues`      | cross_community | 9     |
| `Load → GetCompetitionDatabase` | cross_community | 5     |
| `Load → GetCompetitionDatabase` | cross_community | 5     |
| `Load → GetCompetitionDatabase` | cross_community | 5     |
| `GET → GetCompetitionDatabase`  | cross_community | 5     |
| `POST → LoadEnvFileValues`      | cross_community | 5     |
| `Load → GetCompetitionDatabase` | cross_community | 4     |
| `Load → GetCompetitionDatabase` | cross_community | 4     |
| `Load → GetCompetitionDatabase` | intra_community | 4     |
| `Load → GetCompetitionDatabase` | cross_community | 4     |

## Connected Areas

| Area       | Connections |
| ---------- | ----------- |
| Guidelines | 4 calls     |
| Server     | 3 calls     |
| Services   | 2 calls     |

## How to Explore

1. `gitnexus_context({name: "load"})` — see callers and callees
2. `gitnexus_query({query: "competition"})` — find related execution flows
3. Read key files listed above for implementation details
