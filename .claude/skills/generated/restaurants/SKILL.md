---
name: restaurants
description: "Skill for the Restaurants area of marketing-offers-tool. 17 symbols across 11 files."
---

# Restaurants

17 symbols | 11 files | Cohesion: 57%

## When to Use

- Working with code in `src/`
- Understanding how createOffer, updateOffer, mapOfferEditorFormToCreateInput work
- Modifying restaurants-related functionality

## Key Files

| File                                                   | Symbols                                |
| ------------------------------------------------------ | -------------------------------------- |
| `src/routes/competition/restaurants/+page.server.ts`   | toggleTrack, addMonitor, removeMonitor |
| `src/routes/aggregator-offers/+page.server.ts`         | createOffer, updateOffer               |
| `src/routes/google-reviews/businesses/+page.server.ts` | addMonitor, removeMonitor              |
| `src/routes/admin/users/+page.server.ts`               | createUser, updateUser                 |
| `src/routes/admin/dim-offers/export/+server.ts`        | formatNumber, GET                      |
| `src/lib/services/offer-editor-form.ts`                | mapOfferEditorFormToCreateInput        |
| `src/lib/services/brands.server.ts`                    | listBrands                             |
| `src/lib/server/auth-guards.ts`                        | requirePermission                      |
| `src/routes/admin/brands/+page.server.ts`              | load                                   |
| `src/routes/admin/dim-offers/+page.server.ts`          | load                                   |

## Entry Points

Start here when exploring this area:

- **`createOffer`** (Function) — `src/routes/aggregator-offers/+page.server.ts:68`
- **`updateOffer`** (Function) — `src/routes/aggregator-offers/+page.server.ts:92`
- **`mapOfferEditorFormToCreateInput`** (Function) — `src/lib/services/offer-editor-form.ts:78`
- **`listBrands`** (Function) — `src/lib/services/brands.server.ts:7`
- **`requirePermission`** (Function) — `src/lib/server/auth-guards.ts:137`

## Key Symbols

| Symbol                            | Type     | File                                                   | Line |
| --------------------------------- | -------- | ------------------------------------------------------ | ---- |
| `createOffer`                     | Function | `src/routes/aggregator-offers/+page.server.ts`         | 68   |
| `updateOffer`                     | Function | `src/routes/aggregator-offers/+page.server.ts`         | 92   |
| `mapOfferEditorFormToCreateInput` | Function | `src/lib/services/offer-editor-form.ts`                | 78   |
| `listBrands`                      | Function | `src/lib/services/brands.server.ts`                    | 7    |
| `requirePermission`               | Function | `src/lib/server/auth-guards.ts`                        | 137  |
| `addMonitor`                      | Function | `src/routes/google-reviews/businesses/+page.server.ts` | 113  |
| `removeMonitor`                   | Function | `src/routes/google-reviews/businesses/+page.server.ts` | 136  |
| `toggleTrack`                     | Function | `src/routes/competition/restaurants/+page.server.ts`   | 124  |
| `addMonitor`                      | Function | `src/routes/competition/restaurants/+page.server.ts`   | 153  |
| `removeMonitor`                   | Function | `src/routes/competition/restaurants/+page.server.ts`   | 174  |
| `createUser`                      | Function | `src/routes/admin/users/+page.server.ts`               | 42   |
| `updateUser`                      | Function | `src/routes/admin/users/+page.server.ts`               | 74   |
| `load`                            | Function | `src/routes/admin/brands/+page.server.ts`              | 5    |
| `load`                            | Function | `src/routes/admin/dim-offers/+page.server.ts`          | 35   |
| `setRestaurantPref`               | Function | `src/lib/services/competition/preferences.server.ts`   | 31   |
| `GET`                             | Function | `src/routes/admin/dim-offers/export/+server.ts`        | 53   |
| `formatNumber`                    | Function | `src/routes/admin/dim-offers/export/+server.ts`        | 49   |

## Execution Flows

| Flow                              | Type            | Steps |
| --------------------------------- | --------------- | ----- |
| `GET → GetSortExpression`         | cross_community | 4     |
| `Load → RequireAuthenticatedUser` | cross_community | 3     |
| `Load → HasPermission`            | cross_community | 3     |
| `Load → RequireAuthenticatedUser` | cross_community | 3     |
| `Load → HasPermission`            | cross_community | 3     |
| `Load → RequireAuthenticatedUser` | cross_community | 3     |
| `Load → HasPermission`            | cross_community | 3     |
| `Load → RequireAuthenticatedUser` | cross_community | 3     |
| `Load → HasPermission`            | cross_community | 3     |
| `Load → RequireAuthenticatedUser` | cross_community | 3     |

## Connected Areas

| Area     | Connections |
| -------- | ----------- |
| Services | 3 calls     |
| Server   | 2 calls     |

## How to Explore

1. `gitnexus_context({name: "createOffer"})` — see callers and callees
2. `gitnexus_query({query: "restaurants"})` — find related execution flows
3. Read key files listed above for implementation details
