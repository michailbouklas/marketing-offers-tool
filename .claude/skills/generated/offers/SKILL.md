---
name: offers
description: "Skill for the Offers area of marketing-offers-tool. 7 symbols across 6 files."
---

# Offers

7 symbols | 6 files | Cohesion: 56%

## When to Use

- Working with code in `src/`
- Understanding how getMonitoredEntityIds, load, load work
- Modifying offers-related functionality

## Key Files

| File                                                   | Symbols                   |
| ------------------------------------------------------ | ------------------------- |
| `src/routes/competition/offers/+page.server.ts`        | exclusiveUpperBound, load |
| `src/lib/services/user-monitor.server.ts`              | getMonitoredEntityIds     |
| `src/routes/google-reviews/businesses/+page.server.ts` | load                      |
| `src/routes/competition/restaurants/+page.server.ts`   | load                      |
| `src/lib/services/competition/processors.server.ts`    | listProcessors            |
| `src/lib/services/competition/preferences.server.ts`   | getUserRestaurantPrefs    |

## Entry Points

Start here when exploring this area:

- **`getMonitoredEntityIds`** (Function) — `src/lib/services/user-monitor.server.ts:12`
- **`load`** (Function) — `src/routes/google-reviews/businesses/+page.server.ts:59`
- **`load`** (Function) — `src/routes/competition/restaurants/+page.server.ts:65`
- **`load`** (Function) — `src/routes/competition/offers/+page.server.ts:62`
- **`listProcessors`** (Function) — `src/lib/services/competition/processors.server.ts:10`

## Key Symbols

| Symbol                   | Type     | File                                                   | Line |
| ------------------------ | -------- | ------------------------------------------------------ | ---- |
| `getMonitoredEntityIds`  | Function | `src/lib/services/user-monitor.server.ts`              | 12   |
| `load`                   | Function | `src/routes/google-reviews/businesses/+page.server.ts` | 59   |
| `load`                   | Function | `src/routes/competition/restaurants/+page.server.ts`   | 65   |
| `load`                   | Function | `src/routes/competition/offers/+page.server.ts`        | 62   |
| `listProcessors`         | Function | `src/lib/services/competition/processors.server.ts`    | 10   |
| `getUserRestaurantPrefs` | Function | `src/lib/services/competition/preferences.server.ts`   | 9    |
| `exclusiveUpperBound`    | Function | `src/routes/competition/offers/+page.server.ts`        | 55   |

## Execution Flows

| Flow                              | Type            | Steps |
| --------------------------------- | --------------- | ----- |
| `Load → GetCompetitionDatabase`   | cross_community | 4     |
| `Load → ParseRoles`               | cross_community | 4     |
| `Load → GetCompetitionDatabase`   | cross_community | 4     |
| `Load → BuildSentimentClause`     | cross_community | 4     |
| `Load → GetGoogleReviewsDatabase` | cross_community | 4     |
| `Load → RequireAuthenticatedUser` | cross_community | 3     |
| `Load → HasPermission`            | cross_community | 3     |
| `Load → GetAuthenticatedUserRole` | cross_community | 3     |
| `Load → RequireAuthenticatedUser` | cross_community | 3     |
| `Load → HasPermission`            | cross_community | 3     |

## Connected Areas

| Area           | Connections |
| -------------- | ----------- |
| Restaurants    | 3 calls     |
| Competition    | 3 calls     |
| Google-reviews | 1 calls     |
| Server         | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "getMonitoredEntityIds"})` — see callers and callees
2. `gitnexus_query({query: "offers"})` — find related execution flows
3. Read key files listed above for implementation details
