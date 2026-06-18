---
name: competition
description: "Skill for the Competition area of marketing-offers-tool. 35 symbols across 7 files."
---

# Competition

35 symbols | 7 files | Cohesion: 75%

## When to Use

- Working with code in `src/`
- Understanding how load, getCompetitionDatabase, getCompetitionCurrency work
- Modifying competition-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/services/competition/restaurants.server.ts` | getSortExpression, buildFilterClauses, buildFilterParams, fetchActiveOfferCounts, listRestaurantsPage (+6) |
| `src/lib/services/competition/offers.server.ts` | fetchLatestPrices, parseMonitoredRestaurantKeys, buildMonitoredRestaurantClause, buildMonitoredRestaurantParams, buildEmptyOffersPage (+4) |
| `src/lib/server/competition-db.ts` | getCompetitionDatabase, getCompetitionCurrency, competitionTable, parseCount, utcIsoExpression (+3) |
| `src/lib/services/competition/dashboard.server.ts` | getDashboardStats, activeOffersByProcessor, recentChanges |
| `src/lib/services/competition/scrape-sessions.server.ts` | getSafePagination, listScrapeSessionsPage |
| `src/routes/competition/+page.server.ts` | load |
| `src/routes/competition/restaurants/[id]/+page.server.ts` | load |

## Entry Points

Start here when exploring this area:

- **`load`** (Function) — `src/routes/competition/+page.server.ts:5`
- **`getCompetitionDatabase`** (Function) — `src/lib/server/competition-db.ts:31`
- **`getCompetitionCurrency`** (Function) — `src/lib/server/competition-db.ts:57`
- **`competitionTable`** (Function) — `src/lib/server/competition-db.ts:73`
- **`parseCount`** (Function) — `src/lib/server/competition-db.ts:120`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `load` | Function | `src/routes/competition/+page.server.ts` | 5 |
| `getCompetitionDatabase` | Function | `src/lib/server/competition-db.ts` | 31 |
| `getCompetitionCurrency` | Function | `src/lib/server/competition-db.ts` | 57 |
| `competitionTable` | Function | `src/lib/server/competition-db.ts` | 73 |
| `parseCount` | Function | `src/lib/server/competition-db.ts` | 120 |
| `utcIsoExpression` | Function | `src/lib/server/competition-db.ts` | 144 |
| `listScrapeSessionsPage` | Function | `src/lib/services/competition/scrape-sessions.server.ts` | 75 |
| `listRestaurantsPage` | Function | `src/lib/services/competition/restaurants.server.ts` | 152 |
| `getDashboardStats` | Function | `src/lib/services/competition/dashboard.server.ts` | 41 |
| `activeOffersByProcessor` | Function | `src/lib/services/competition/dashboard.server.ts` | 116 |
| `latestProductPriceSubquery` | Function | `src/lib/server/competition-db.ts` | 90 |
| `parseNullableNumber` | Function | `src/lib/server/competition-db.ts` | 100 |
| `items` | Function | `src/lib/services/competition/restaurants.server.ts` | 215 |
| `getRestaurantDetail` | Function | `src/lib/services/competition/restaurants.server.ts` | 334 |
| `activeOffers` | Function | `src/lib/services/competition/restaurants.server.ts` | 475 |
| `recentChanges` | Function | `src/lib/services/competition/dashboard.server.ts` | 125 |
| `load` | Function | `src/routes/competition/restaurants/[id]/+page.server.ts` | 8 |
| `buildWhereClause` | Function | `src/lib/server/competition-db.ts` | 134 |
| `listActiveOffersPage` | Function | `src/lib/services/competition/offers.server.ts` | 242 |
| `getSafePagination` | Function | `src/lib/services/competition/scrape-sessions.server.ts` | 40 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Load → LoadEnvFileValues` | cross_community | 9 |
| `Load → GetCompetitionDatabase` | cross_community | 5 |
| `Load → GetCompetitionDatabase` | cross_community | 4 |
| `Load → GetCompetitionDatabase` | cross_community | 4 |
| `Load → GetCompetitionDatabase` | intra_community | 4 |
| `Load → GetCompetitionDatabase` | cross_community | 4 |
| `Load → BuildWhereClause` | cross_community | 3 |
| `Load → BuildFilterClauses` | cross_community | 3 |
| `Load → BuildFilterParams` | cross_community | 3 |
| `Load → RequireAuthenticatedUser` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Restaurants | 2 calls |
| Server | 1 calls |

## How to Explore

1. `gitnexus_context({name: "load"})` — see callers and callees
2. `gitnexus_query({query: "competition"})` — find related execution flows
3. Read key files listed above for implementation details
