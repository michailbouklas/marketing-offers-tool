---
name: reviews
description: "Skill for the Reviews area of marketing-offers-tool. 4 symbols across 3 files."
---

# Reviews

4 symbols | 3 files | Cohesion: 46%

## When to Use

- Working with code in `src/`
- Understanding how getEntityIdsForBrand, load, listReviewCategories work
- Modifying reviews-related functionality

## Key Files

| File                                                   | Symbols                   |
| ------------------------------------------------------ | ------------------------- |
| `src/routes/google-reviews/reviews/+page.server.ts`    | exclusiveUpperBound, load |
| `src/lib/services/brand-entities.server.ts`            | getEntityIdsForBrand      |
| `src/lib/services/google-reviews/categories.server.ts` | listReviewCategories      |

## Entry Points

Start here when exploring this area:

- **`getEntityIdsForBrand`** (Function) — `src/lib/services/brand-entities.server.ts:196`
- **`load`** (Function) — `src/routes/google-reviews/reviews/+page.server.ts:75`
- **`listReviewCategories`** (Function) — `src/lib/services/google-reviews/categories.server.ts:143`

## Key Symbols

| Symbol                 | Type     | File                                                   | Line |
| ---------------------- | -------- | ------------------------------------------------------ | ---- |
| `getEntityIdsForBrand` | Function | `src/lib/services/brand-entities.server.ts`            | 196  |
| `load`                 | Function | `src/routes/google-reviews/reviews/+page.server.ts`    | 75   |
| `listReviewCategories` | Function | `src/lib/services/google-reviews/categories.server.ts` | 143  |
| `exclusiveUpperBound`  | Function | `src/routes/google-reviews/reviews/+page.server.ts`    | 68   |

## Execution Flows

| Flow                              | Type            | Steps |
| --------------------------------- | --------------- | ----- |
| `Load → GetGoogleReviewsDatabase` | cross_community | 4     |
| `Load → RequireAuthenticatedUser` | cross_community | 3     |
| `Load → HasPermission`            | cross_community | 3     |
| `Load → ParseCount`               | cross_community | 3     |

## Connected Areas

| Area           | Connections |
| -------------- | ----------- |
| Google-reviews | 2 calls     |
| Services       | 1 calls     |
| Offers         | 1 calls     |
| Export         | 1 calls     |
| Server         | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "getEntityIdsForBrand"})` — see callers and callees
2. `gitnexus_query({query: "reviews"})` — find related execution flows
3. Read key files listed above for implementation details
