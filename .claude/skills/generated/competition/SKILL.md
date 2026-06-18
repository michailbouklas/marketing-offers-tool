---
name: competition
description: "Skill for the Competition area of marketing-offers-tool. 32 symbols across 11 files."
---

# Competition

32 symbols | 11 files | Cohesion: 69%

## When to Use

- Working with code in `src/`
- Understanding how latestProductPriceSubquery, parseNullableNumber, items work
- Modifying competition-related functionality

## Key Files

| File                                                      | Symbols                                                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/lib/services/competition/restaurants.server.ts`      | items, groupMenuRows, computeTransitions, groupTimeSeriesRows, getRestaurantDetail (+6)                    |
| `src/lib/server/competition-db.ts`                        | latestProductPriceSubquery, parseNullableNumber, getCompetitionDatabase, competitionTable, parseCount (+1) |
| `src/lib/services/competition/offers.server.ts`           | fetchLatestPrices, getSortExpression, buildFilterClauses, buildFilterParams, listActiveOffersPage          |
| `src/lib/services/competition/dashboard.server.ts`        | recentChanges, activeOffersByProcessor                                                                     |
| `src/routes/competition/offers/+page.server.ts`           | exclusiveUpperBound, load                                                                                  |
| `src/routes/competition/restaurants/[id]/+page.server.ts` | load                                                                                                       |
| `src/lib/services/user-monitor.server.ts`                 | getMonitoredEntityIds                                                                                      |
| `src/lib/services/competition/processors.server.ts`       | listProcessors                                                                                             |
| `src/lib/services/competition/preferences.server.ts`      | getUserRestaurantPrefs                                                                                     |
| `src/routes/google-reviews/businesses/+page.server.ts`    | load                                                                                                       |

## Entry Points

Start here when exploring this area:

- **`latestProductPriceSubquery`** (Function) — `src/lib/server/competition-db.ts:90`
- **`parseNullableNumber`** (Function) — `src/lib/server/competition-db.ts:100`
- **`items`** (Function) — `src/lib/services/competition/restaurants.server.ts:215`
- **`getRestaurantDetail`** (Function) — `src/lib/services/competition/restaurants.server.ts:334`
- **`activeOffers`** (Function) — `src/lib/services/competition/restaurants.server.ts:475`

## Key Symbols

| Symbol                       | Type     | File                                                      | Line |
| ---------------------------- | -------- | --------------------------------------------------------- | ---- |
| `latestProductPriceSubquery` | Function | `src/lib/server/competition-db.ts`                        | 90   |
| `parseNullableNumber`        | Function | `src/lib/server/competition-db.ts`                        | 100  |
| `items`                      | Function | `src/lib/services/competition/restaurants.server.ts`      | 215  |
| `getRestaurantDetail`        | Function | `src/lib/services/competition/restaurants.server.ts`      | 334  |
| `activeOffers`               | Function | `src/lib/services/competition/restaurants.server.ts`      | 475  |
| `recentChanges`              | Function | `src/lib/services/competition/dashboard.server.ts`        | 125  |
| `load`                       | Function | `src/routes/competition/restaurants/[id]/+page.server.ts` | 8    |
| `getCompetitionDatabase`     | Function | `src/lib/server/competition-db.ts`                        | 31   |
| `competitionTable`           | Function | `src/lib/server/competition-db.ts`                        | 73   |
| `parseCount`                 | Function | `src/lib/server/competition-db.ts`                        | 120  |
| `listRestaurantsPage`        | Function | `src/lib/services/competition/restaurants.server.ts`      | 152  |
| `activeOffersByProcessor`    | Function | `src/lib/services/competition/dashboard.server.ts`        | 116  |
| `getMonitoredEntityIds`      | Function | `src/lib/services/user-monitor.server.ts`                 | 12   |
| `listProcessors`             | Function | `src/lib/services/competition/processors.server.ts`       | 10   |
| `getUserRestaurantPrefs`     | Function | `src/lib/services/competition/preferences.server.ts`      | 9    |
| `load`                       | Function | `src/routes/google-reviews/businesses/+page.server.ts`    | 59   |
| `load`                       | Function | `src/routes/competition/restaurants/+page.server.ts`      | 65   |
| `load`                       | Function | `src/routes/competition/offers/+page.server.ts`           | 59   |
| `buildWhereClause`           | Function | `src/lib/server/competition-db.ts`                        | 134  |
| `listActiveOffersPage`       | Function | `src/lib/services/competition/offers.server.ts`           | 136  |

## Execution Flows

| Flow                              | Type            | Steps |
| --------------------------------- | --------------- | ----- |
| `Load → GetCompetitionDatabase`   | cross_community | 5     |
| `Load → GetCompetitionDatabase`   | cross_community | 4     |
| `Load → GetCompetitionDatabase`   | cross_community | 4     |
| `Load → BuildSentimentClause`     | cross_community | 4     |
| `Load → GetGoogleReviewsDatabase` | cross_community | 4     |
| `Load → GetCompetitionDatabase`   | cross_community | 4     |
| `Load → RequireAuthenticatedUser` | cross_community | 3     |
| `Load → HasPermission`            | cross_community | 3     |
| `Load → BuildWhereClause`         | cross_community | 3     |
| `Load → BuildFilterClauses`       | cross_community | 3     |

## Connected Areas

| Area           | Connections |
| -------------- | ----------- |
| Server         | 4 calls     |
| Services       | 4 calls     |
| Google-reviews | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "latestProductPriceSubquery"})` — see callers and callees
2. `gitnexus_query({query: "competition"})` — find related execution flows
3. Read key files listed above for implementation details
