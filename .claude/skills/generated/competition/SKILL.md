---
name: competition
description: "Skill for the Competition area of marketing-offers-tool. 33 symbols across 11 files."
---

# Competition

33 symbols | 11 files | Cohesion: 74%

## When to Use

- Working with code in `src/`
- Understanding how load, getCompetitionDatabase, competitionTable work
- Modifying competition-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/services/competition/restaurants.server.ts` | getSortExpression, buildFilterClauses, buildFilterParams, fetchActiveOfferCounts, listRestaurantsPage (+5) |
| `src/lib/server/competition-db.ts` | getCompetitionDatabase, competitionTable, parseCount, utcIsoExpression, buildWhereClause (+1) |
| `src/lib/services/competition/offers.server.ts` | getSortExpression, buildFilterClauses, buildFilterParams, listActiveOffersPage, mapOfferRow |
| `src/lib/services/competition/dashboard.server.ts` | getDashboardStats, activeOffersByProcessor, recentChanges |
| `src/routes/competition/offers/+page.server.ts` | exclusiveUpperBound, load |
| `src/lib/services/competition/competition.ts` | formatCompetitionMoney, formatCompetitionDiscount |
| `src/routes/competition/+page.server.ts` | load |
| `src/routes/competition/restaurants/+page.server.ts` | load |
| `src/lib/services/competition/processors.server.ts` | listProcessors |
| `src/lib/services/competition/preferences.server.ts` | getUserRestaurantPrefs |

## Entry Points

Start here when exploring this area:

- **`load`** (Function) — `src/routes/competition/+page.server.ts:4`
- **`getCompetitionDatabase`** (Function) — `src/lib/server/competition-db.ts:23`
- **`competitionTable`** (Function) — `src/lib/server/competition-db.ts:47`
- **`parseCount`** (Function) — `src/lib/server/competition-db.ts:72`
- **`utcIsoExpression`** (Function) — `src/lib/server/competition-db.ts:96`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `load` | Function | `src/routes/competition/+page.server.ts` | 4 |
| `getCompetitionDatabase` | Function | `src/lib/server/competition-db.ts` | 23 |
| `competitionTable` | Function | `src/lib/server/competition-db.ts` | 47 |
| `parseCount` | Function | `src/lib/server/competition-db.ts` | 72 |
| `utcIsoExpression` | Function | `src/lib/server/competition-db.ts` | 96 |
| `load` | Function | `src/routes/competition/restaurants/+page.server.ts` | 56 |
| `listRestaurantsPage` | Function | `src/lib/services/competition/restaurants.server.ts` | 159 |
| `listProcessors` | Function | `src/lib/services/competition/processors.server.ts` | 10 |
| `getUserRestaurantPrefs` | Function | `src/lib/services/competition/preferences.server.ts` | 9 |
| `getDashboardStats` | Function | `src/lib/services/competition/dashboard.server.ts` | 41 |
| `activeOffersByProcessor` | Function | `src/lib/services/competition/dashboard.server.ts` | 112 |
| `buildWhereClause` | Function | `src/lib/server/competition-db.ts` | 86 |
| `load` | Function | `src/routes/competition/offers/+page.server.ts` | 59 |
| `listActiveOffersPage` | Function | `src/lib/services/competition/offers.server.ts` | 130 |
| `parseNullableNumber` | Function | `src/lib/server/competition-db.ts` | 52 |
| `items` | Function | `src/lib/services/competition/restaurants.server.ts` | 224 |
| `activeOffers` | Function | `src/lib/services/competition/restaurants.server.ts` | 462 |
| `recentChanges` | Function | `src/lib/services/competition/dashboard.server.ts` | 121 |
| `getRestaurantDetail` | Function | `src/lib/services/competition/restaurants.server.ts` | 317 |
| `load` | Function | `src/routes/competition/restaurants/[id]/+page.server.ts` | 8 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Load → GetCompetitionDatabase` | cross_community | 4 |
| `Load → GetCompetitionDatabase` | intra_community | 4 |
| `Load → GetCompetitionDatabase` | intra_community | 4 |
| `Load → GetCompetitionDatabase` | cross_community | 4 |
| `Load → ParseNullableNumber` | cross_community | 4 |
| `Load → RequireAuthenticatedUser` | cross_community | 3 |
| `Load → HasPermission` | cross_community | 3 |
| `Load → BuildWhereClause` | intra_community | 3 |
| `Load → BuildFilterClauses` | intra_community | 3 |
| `Load → BuildFilterParams` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Services | 4 calls |

## How to Explore

1. `gitnexus_context({name: "load"})` — see callers and callees
2. `gitnexus_query({query: "competition"})` — find related execution flows
3. Read key files listed above for implementation details
