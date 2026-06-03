---
name: aggregator-offers
description: "Skill for the Aggregator-offers area of marketing-offers-tool. 11 symbols across 8 files."
---

# Aggregator-offers

11 symbols | 8 files | Cohesion: 68%

## When to Use

- Working with code in `src/`
- Understanding how createOffer, updateOffer, mapOfferEditorFormToCreateInput work
- Modifying aggregator-offers-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/routes/aggregator-offers/+page.server.ts` | createOffer, updateOffer |
| `src/routes/admin/users/+page.server.ts` | createUser, updateUser |
| `src/routes/admin/dim-offers/export/+server.ts` | formatNumber, GET |
| `src/lib/services/offer-editor-form.ts` | mapOfferEditorFormToCreateInput |
| `src/lib/services/brands.server.ts` | listBrands |
| `src/lib/server/auth-guards.ts` | requirePermission |
| `src/routes/admin/brands/+page.server.ts` | load |
| `src/routes/admin/dim-offers/+page.server.ts` | load |

## Entry Points

Start here when exploring this area:

- **`createOffer`** (Function) — `src/routes/aggregator-offers/+page.server.ts:68`
- **`updateOffer`** (Function) — `src/routes/aggregator-offers/+page.server.ts:92`
- **`mapOfferEditorFormToCreateInput`** (Function) — `src/lib/services/offer-editor-form.ts:78`
- **`listBrands`** (Function) — `src/lib/services/brands.server.ts:7`
- **`requirePermission`** (Function) — `src/lib/server/auth-guards.ts:77`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `createOffer` | Function | `src/routes/aggregator-offers/+page.server.ts` | 68 |
| `updateOffer` | Function | `src/routes/aggregator-offers/+page.server.ts` | 92 |
| `mapOfferEditorFormToCreateInput` | Function | `src/lib/services/offer-editor-form.ts` | 78 |
| `listBrands` | Function | `src/lib/services/brands.server.ts` | 7 |
| `requirePermission` | Function | `src/lib/server/auth-guards.ts` | 77 |
| `createUser` | Function | `src/routes/admin/users/+page.server.ts` | 42 |
| `updateUser` | Function | `src/routes/admin/users/+page.server.ts` | 74 |
| `load` | Function | `src/routes/admin/brands/+page.server.ts` | 5 |
| `load` | Function | `src/routes/admin/dim-offers/+page.server.ts` | 35 |
| `GET` | Function | `src/routes/admin/dim-offers/export/+server.ts` | 53 |
| `formatNumber` | Function | `src/routes/admin/dim-offers/export/+server.ts` | 49 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `GET → GetSortExpression` | cross_community | 4 |
| `Load → RequireAuthenticatedUser` | cross_community | 3 |
| `Load → HasPermission` | cross_community | 3 |
| `Load → RequireAuthenticatedUser` | cross_community | 3 |
| `Load → HasPermission` | cross_community | 3 |
| `Load → BuildFilterClauses` | cross_community | 3 |
| `Load → BuildWhereClause` | cross_community | 3 |
| `Load → BuildBaseQueryParams` | cross_community | 3 |
| `Load → ShouldJoinResolvedBrands` | cross_community | 3 |
| `Load → RequireAuthenticatedUser` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Services | 3 calls |
| Server | 2 calls |

## How to Explore

1. `gitnexus_context({name: "createOffer"})` — see callers and callees
2. `gitnexus_query({query: "aggregator-offers"})` — find related execution flows
3. Read key files listed above for implementation details
