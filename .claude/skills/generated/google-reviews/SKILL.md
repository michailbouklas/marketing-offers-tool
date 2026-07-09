---
name: google-reviews
description: "Skill for the Google-reviews area of marketing-offers-tool. 36 symbols across 9 files."
---

# Google-reviews

36 symbols | 9 files | Cohesion: 62%

## When to Use

- Working with code in `src/`
- Understanding how buildWhereClause, listBusinessesPage, listReviewsPage work
- Modifying google-reviews-related functionality

## Key Files

| File                                                                                    | Symbols                                                                                                              |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/lib/services/google-reviews/businesses.server.ts`                                  | getSortExpression, buildSentimentClause, buildFilterClauses, buildFilterParams, needsSummaryJoin (+8)                |
| `src/lib/services/google-reviews/reviews.server.ts`                                     | normalizeMonitoredBusinessCids, buildEmptyReviewsPage, getSortExpression, buildFilterClauses, buildFilterParams (+2) |
| `src/lib/server/google-reviews-db.ts`                                                   | buildWhereClause, parseNullableNumber, parseCount, utcIsoExpression                                                  |
| `src/lib/services/google-reviews/categories.server.ts`                                  | getSortExpression, buildFilterClauses, buildFilterParams, listNegativeReviewCategories                               |
| `src/lib/services/google-reviews/dashboard.server.ts`                                   | getDashboardStats, mapTimeseries, topBusinesses                                                                      |
| `src/routes/google-reviews/negative-reviews-categories/+page.server.ts`                 | exclusiveUpperBound, load                                                                                            |
| `src/routes/google-reviews/businesses/[cid]/categories/[categoryId]/reviews/+server.ts` | GET                                                                                                                  |
| `src/routes/google-reviews/+page.server.ts`                                             | load                                                                                                                 |
| `src/routes/google-reviews/businesses/[cid]/+page.server.ts`                            | load                                                                                                                 |

## Entry Points

Start here when exploring this area:

- **`buildWhereClause`** (Function) — `src/lib/server/google-reviews-db.ts:86`
- **`listBusinessesPage`** (Function) — `src/lib/services/google-reviews/businesses.server.ts:221`
- **`listReviewsPage`** (Function) — `src/lib/services/google-reviews/reviews.server.ts:165`
- **`GET`** (Function) — `src/routes/google-reviews/businesses/[cid]/categories/[categoryId]/reviews/+server.ts:17`
- **`load`** (Function) — `src/routes/google-reviews/+page.server.ts:4`

## Key Symbols

| Symbol                         | Type     | File                                                                                    | Line |
| ------------------------------ | -------- | --------------------------------------------------------------------------------------- | ---- |
| `buildWhereClause`             | Function | `src/lib/server/google-reviews-db.ts`                                                   | 86   |
| `listBusinessesPage`           | Function | `src/lib/services/google-reviews/businesses.server.ts`                                  | 221  |
| `listReviewsPage`              | Function | `src/lib/services/google-reviews/reviews.server.ts`                                     | 165  |
| `GET`                          | Function | `src/routes/google-reviews/businesses/[cid]/categories/[categoryId]/reviews/+server.ts` | 17   |
| `load`                         | Function | `src/routes/google-reviews/+page.server.ts`                                             | 4    |
| `parseNullableNumber`          | Function | `src/lib/server/google-reviews-db.ts`                                                   | 52   |
| `mapReviewRow`                 | Function | `src/lib/services/google-reviews/reviews.server.ts`                                     | 151  |
| `getDashboardStats`            | Function | `src/lib/services/google-reviews/dashboard.server.ts`                                   | 58   |
| `mapTimeseries`                | Function | `src/lib/services/google-reviews/dashboard.server.ts`                                   | 191  |
| `avgRatingPerDay`              | Function | `src/lib/services/google-reviews/businesses.server.ts`                                  | 566  |
| `parseCount`                   | Function | `src/lib/server/google-reviews-db.ts`                                                   | 72   |
| `topBusinesses`                | Function | `src/lib/services/google-reviews/dashboard.server.ts`                                   | 213  |
| `items`                        | Function | `src/lib/services/google-reviews/businesses.server.ts`                                  | 282  |
| `categories`                   | Function | `src/lib/services/google-reviews/businesses.server.ts`                                  | 552  |
| `reviewsPerDay`                | Function | `src/lib/services/google-reviews/businesses.server.ts`                                  | 561  |
| `sentimentPerDay`              | Function | `src/lib/services/google-reviews/businesses.server.ts`                                  | 571  |
| `load`                         | Function | `src/routes/google-reviews/negative-reviews-categories/+page.server.ts`                 | 62   |
| `listNegativeReviewCategories` | Function | `src/lib/services/google-reviews/categories.server.ts`                                  | 95   |
| `utcIsoExpression`             | Function | `src/lib/server/google-reviews-db.ts`                                                   | 96   |
| `getBusinessDetail`            | Function | `src/lib/services/google-reviews/businesses.server.ts`                                  | 303  |

## Execution Flows

| Flow                              | Type            | Steps |
| --------------------------------- | --------------- | ----- |
| `Load → GetGoogleReviewsDatabase` | cross_community | 4     |
| `Load → BuildSentimentClause`     | cross_community | 4     |
| `Load → GetGoogleReviewsDatabase` | cross_community | 4     |
| `Load → GetGoogleReviewsDatabase` | cross_community | 4     |
| `Load → ParseNullableNumber`      | intra_community | 4     |
| `Load → GetGoogleReviewsDatabase` | cross_community | 4     |
| `Load → ParseCount`               | cross_community | 3     |
| `Load → RequireAuthenticatedUser` | cross_community | 3     |
| `Load → HasPermission`            | cross_community | 3     |
| `Load → BuildWhereClause`         | cross_community | 3     |

## Connected Areas

| Area       | Connections |
| ---------- | ----------- |
| Server     | 5 calls     |
| Services   | 3 calls     |
| Offers     | 1 calls     |
| Guidelines | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "buildWhereClause"})` — see callers and callees
2. `gitnexus_query({query: "google-reviews"})` — find related execution flows
3. Read key files listed above for implementation details
