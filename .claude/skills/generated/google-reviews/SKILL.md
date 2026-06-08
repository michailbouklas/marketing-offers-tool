---
name: google-reviews
description: "Skill for the Google-reviews area of marketing-offers-tool. 27 symbols across 8 files."
---

# Google-reviews

27 symbols | 8 files | Cohesion: 78%

## When to Use

- Working with code in `src/`
- Understanding how load, getGoogleReviewsDatabase, googleReviewsTable work
- Modifying google-reviews-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/services/google-reviews/businesses.server.ts` | items, getBusinessDetail, getSortExpression, buildSentimentClause, buildFilterClauses (+3) |
| `src/lib/server/google-reviews-db.ts` | getGoogleReviewsDatabase, googleReviewsTable, parseNullableNumber, parseCount, utcIsoExpression (+1) |
| `src/lib/services/google-reviews/reviews.server.ts` | mapReviewRow, getSortExpression, buildFilterClauses, buildFilterParams, listReviewsPage |
| `src/lib/services/google-reviews/dashboard.server.ts` | getDashboardStats, mapTimeseries, topBusinesses |
| `src/routes/google-reviews/reviews/+page.server.ts` | exclusiveUpperBound, load |
| `src/routes/google-reviews/+page.server.ts` | load |
| `src/routes/google-reviews/businesses/[cid]/+page.server.ts` | load |
| `src/routes/google-reviews/businesses/+page.server.ts` | load |

## Entry Points

Start here when exploring this area:

- **`load`** (Function) — `src/routes/google-reviews/+page.server.ts:4`
- **`getGoogleReviewsDatabase`** (Function) — `src/lib/server/google-reviews-db.ts:23`
- **`googleReviewsTable`** (Function) — `src/lib/server/google-reviews-db.ts:47`
- **`parseNullableNumber`** (Function) — `src/lib/server/google-reviews-db.ts:52`
- **`parseCount`** (Function) — `src/lib/server/google-reviews-db.ts:72`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `load` | Function | `src/routes/google-reviews/+page.server.ts` | 4 |
| `getGoogleReviewsDatabase` | Function | `src/lib/server/google-reviews-db.ts` | 23 |
| `googleReviewsTable` | Function | `src/lib/server/google-reviews-db.ts` | 47 |
| `parseNullableNumber` | Function | `src/lib/server/google-reviews-db.ts` | 52 |
| `parseCount` | Function | `src/lib/server/google-reviews-db.ts` | 72 |
| `utcIsoExpression` | Function | `src/lib/server/google-reviews-db.ts` | 96 |
| `mapReviewRow` | Function | `src/lib/services/google-reviews/reviews.server.ts` | 98 |
| `getDashboardStats` | Function | `src/lib/services/google-reviews/dashboard.server.ts` | 53 |
| `mapTimeseries` | Function | `src/lib/services/google-reviews/dashboard.server.ts` | 178 |
| `topBusinesses` | Function | `src/lib/services/google-reviews/dashboard.server.ts` | 200 |
| `items` | Function | `src/lib/services/google-reviews/businesses.server.ts` | 239 |
| `getBusinessDetail` | Function | `src/lib/services/google-reviews/businesses.server.ts` | 260 |
| `load` | Function | `src/routes/google-reviews/businesses/[cid]/+page.server.ts` | 10 |
| `buildWhereClause` | Function | `src/lib/server/google-reviews-db.ts` | 86 |
| `load` | Function | `src/routes/google-reviews/reviews/+page.server.ts` | 63 |
| `listReviewsPage` | Function | `src/lib/services/google-reviews/reviews.server.ts` | 112 |
| `load` | Function | `src/routes/google-reviews/businesses/+page.server.ts` | 49 |
| `listBusinessesPage` | Function | `src/lib/services/google-reviews/businesses.server.ts` | 178 |
| `exclusiveUpperBound` | Function | `src/routes/google-reviews/reviews/+page.server.ts` | 56 |
| `getSortExpression` | Function | `src/lib/services/google-reviews/reviews.server.ts` | 50 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Load → GetGoogleReviewsDatabase` | cross_community | 4 |
| `Load → GetGoogleReviewsDatabase` | intra_community | 4 |
| `Load → ParseNullableNumber` | intra_community | 4 |
| `Load → BuildSentimentClause` | intra_community | 4 |
| `Load → GetGoogleReviewsDatabase` | cross_community | 4 |
| `Load → GetGoogleReviewsDatabase` | intra_community | 4 |
| `Load → RequireAuthenticatedUser` | cross_community | 3 |
| `Load → HasPermission` | cross_community | 3 |
| `Load → BuildWhereClause` | intra_community | 3 |
| `Load → BuildFilterClauses` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Services | 4 calls |

## How to Explore

1. `gitnexus_context({name: "load"})` — see callers and callees
2. `gitnexus_query({query: "google-reviews"})` — find related execution flows
3. Read key files listed above for implementation details
