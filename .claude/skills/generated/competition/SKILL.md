---
name: competition
description: "Skill for the Competition area of marketing-offers-tool. 29 symbols across 6 files."
---

# Competition

29 symbols | 6 files | Cohesion: 68%

## When to Use

- Working with code in `src/`
- Understanding how latestProductPriceSubquery, parseNullableNumber, items work
- Modifying competition-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/services/competition/restaurants.server.ts` | items, groupMenuRows, computeTransitions, groupTimeSeriesRows, getRestaurantDetail (+6) |
| `src/lib/server/competition-db.ts` | latestProductPriceSubquery, parseNullableNumber, getCompetitionDatabase, competitionTable, parseCount (+3) |
| `src/lib/services/competition/offers.server.ts` | fetchLatestPrices, getSortExpression, buildFilterClauses, buildFilterParams, listActiveOffersPage |
| `src/lib/services/competition/dashboard.server.ts` | recentChanges, activeOffersByProcessor, getDashboardStats |
| `src/routes/competition/restaurants/[id]/+page.server.ts` | load |
| `src/routes/competition/+page.server.ts` | load |

## Entry Points

Start here when exploring this area:

- **`latestProductPriceSubquery`** (Function) — `src/lib/server/competition-db.ts:90`
- **`parseNullableNumber`** (Function) — `src/lib/server/competition-db.ts:100`
- **`items`** (Function) — `src/lib/services/competition/restaurants.server.ts:215`
- **`getRestaurantDetail`** (Function) — `src/lib/services/competition/restaurants.server.ts:334`
- **`activeOffers`** (Function) — `src/lib/services/competition/restaurants.server.ts:475`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `latestProductPriceSubquery` | Function | `src/lib/server/competition-db.ts` | 90 |
| `parseNullableNumber` | Function | `src/lib/server/competition-db.ts` | 100 |
| `items` | Function | `src/lib/services/competition/restaurants.server.ts` | 215 |
| `getRestaurantDetail` | Function | `src/lib/services/competition/restaurants.server.ts` | 334 |
| `activeOffers` | Function | `src/lib/services/competition/restaurants.server.ts` | 475 |
| `recentChanges` | Function | `src/lib/services/competition/dashboard.server.ts` | 125 |
| `load` | Function | `src/routes/competition/restaurants/[id]/+page.server.ts` | 8 |
| `getCompetitionDatabase` | Function | `src/lib/server/competition-db.ts` | 31 |
| `competitionTable` | Function | `src/lib/server/competition-db.ts` | 73 |
| `parseCount` | Function | `src/lib/server/competition-db.ts` | 120 |
| `listRestaurantsPage` | Function | `src/lib/services/competition/restaurants.server.ts` | 152 |
| `activeOffersByProcessor` | Function | `src/lib/services/competition/dashboard.server.ts` | 116 |
| `buildWhereClause` | Function | `src/lib/server/competition-db.ts` | 134 |
| `listActiveOffersPage` | Function | `src/lib/services/competition/offers.server.ts` | 136 |
| `load` | Function | `src/routes/competition/+page.server.ts` | 4 |
| `getCompetitionCurrency` | Function | `src/lib/server/competition-db.ts` | 57 |
| `utcIsoExpression` | Function | `src/lib/server/competition-db.ts` | 144 |
| `getDashboardStats` | Function | `src/lib/services/competition/dashboard.server.ts` | 41 |
| `groupMenuRows` | Function | `src/lib/services/competition/restaurants.server.ts` | 245 |
| `computeTransitions` | Function | `src/lib/services/competition/restaurants.server.ts` | 283 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Load → GetCompetitionDatabase` | cross_community | 5 |
| `Load → GetCompetitionDatabase` | cross_community | 4 |
| `Load → GetCompetitionDatabase` | cross_community | 4 |
| `Load → GetCompetitionDatabase` | cross_community | 4 |
| `Load → BuildWhereClause` | cross_community | 3 |
| `Load → BuildFilterClauses` | cross_community | 3 |
| `Load → BuildFilterParams` | cross_community | 3 |
| `Load → BuildWhereClause` | cross_community | 3 |
| `Load → BuildFilterClauses` | cross_community | 3 |
| `Load → BuildFilterParams` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Services | 2 calls |

## How to Explore

1. `gitnexus_context({name: "latestProductPriceSubquery"})` — see callers and callees
2. `gitnexus_query({query: "competition"})` — find related execution flows
3. Read key files listed above for implementation details
