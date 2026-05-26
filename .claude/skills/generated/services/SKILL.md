---
name: services
description: "Skill for the Services area of marketing-offers-tool. 131 symbols across 31 files."
---

# Services

131 symbols | 31 files | Cohesion: 80%

## When to Use

- Working with code in `src/`
- Understanding how listAdminDimOffersRows, listAdminDimOffersPage, load work
- Modifying services-related functionality

## Key Files

| File                                                        | Symbols                                                                                                                           |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/services/offers-data-quality.ts`                   | parseMissingFields, getBrandAliases, getSelectedBrandAliases, getDefaultGapPricingFormData, applyGapPricingLookupDefaults (+12)   |
| `src/lib/services/offers-data-quality-postgres.server.ts`   | listGapRecords, listChannels, getPendingStagingRecordByGapId, validateCategorySubcategoryPair, createDimOffersStagingRecord (+10) |
| `src/lib/services/admin-dim-offers.server.ts`               | parseCount, getSortExpression, buildFilterClauses, buildWhereClause, buildBaseQueryParams (+9)                                    |
| `src/lib/services/offers-data-quality.server.ts`            | getOpenGapList, getGapFormData, mapPendingSubmission, getPendingGapSubmission, getPendingGapSubmissionQueue (+9)                  |
| `src/lib/services/offers-data-quality-clickhouse.server.ts` | parseLookbackDays, formatDate, subtractDays, getTransactionItemContext, insertDimOffer (+7)                                       |
| `src/lib/services/offers-filter-form.ts`                    | mapOffersFilterFormToFilters, applyLifecyclePreset, toStartOfDay, toEndOfDay, toLocalStartOfDay (+3)                              |
| `src/lib/services/users.server.ts`                          | listUsers, normalizeRole, createUser, updateUser, validateBrandIds (+1)                                                           |
| `src/lib/services/dim-offers-audit.server.ts`               | listChangedFields, createDimOffersAuditRecord, parseNullableNumber, isSnapshotRecord, mapSnapshotToAdminRow (+1)                  |
| `src/lib/services/user-editor-form.ts`                      | getDefaultCreateUserFormData, getDefaultEditUserFormData, normalizeUserRole, normalizeBrandIds                                    |
| `src/lib/services/home-offer-widgets.ts`                    | getStartOfDay, getEndOfDay, addDays, getHomeOfferWidgets                                                                          |

## Entry Points

Start here when exploring this area:

- **`listAdminDimOffersRows`** (Function) — `src/lib/services/admin-dim-offers.server.ts:297`
- **`listAdminDimOffersPage`** (Function) — `src/lib/services/admin-dim-offers.server.ts:382`
- **`load`** (Function) — `src/routes/offers-data-quality/+page.server.ts:20`
- **`parseMissingFields`** (Function) — `src/lib/services/offers-data-quality.ts:350`
- **`getBrandAliases`** (Function) — `src/lib/services/offers-data-quality.ts:381`

## Key Symbols

| Symbol                                   | Type     | File                                                      | Line |
| ---------------------------------------- | -------- | --------------------------------------------------------- | ---- |
| `listAdminDimOffersRows`                 | Function | `src/lib/services/admin-dim-offers.server.ts`             | 297  |
| `listAdminDimOffersPage`                 | Function | `src/lib/services/admin-dim-offers.server.ts`             | 382  |
| `load`                                   | Function | `src/routes/offers-data-quality/+page.server.ts`          | 20   |
| `parseMissingFields`                     | Function | `src/lib/services/offers-data-quality.ts`                 | 350  |
| `getBrandAliases`                        | Function | `src/lib/services/offers-data-quality.ts`                 | 381  |
| `getSelectedBrandAliases`                | Function | `src/lib/services/offers-data-quality.ts`                 | 387  |
| `getOpenGapList`                         | Function | `src/lib/services/offers-data-quality.server.ts`          | 245  |
| `listGapRecords`                         | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 91   |
| `listBrandsForUser`                      | Function | `src/lib/services/brands.server.ts`                       | 25   |
| `GET`                                    | Function | `src/routes/api/gaps/+server.ts`                          | 20   |
| `listUsers`                              | Function | `src/lib/services/users.server.ts`                        | 9    |
| `getDefaultCreateUserFormData`           | Function | `src/lib/services/user-editor-form.ts`                    | 76   |
| `getDefaultEditUserFormData`             | Function | `src/lib/services/user-editor-form.ts`                    | 86   |
| `load`                                   | Function | `src/routes/admin/users/+page.server.ts`                  | 15   |
| `mapOffersFilterFormToFilters`           | Function | `src/lib/services/offers-filter-form.ts`                  | 77   |
| `getDefaultGapPricingFormData`           | Function | `src/lib/services/offers-data-quality.ts`                 | 272  |
| `applyGapPricingLookupDefaults`          | Function | `src/lib/services/offers-data-quality.ts`                 | 285  |
| `mapGapLoadResponseToGapPricingFormData` | Function | `src/lib/services/offers-data-quality.ts`                 | 309  |
| `listChannels`                           | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 37   |
| `load`                                   | Function | `src/routes/offers-data-quality/[id]/+page.server.ts`     | 22   |

## Execution Flows

| Flow                               | Type            | Steps |
| ---------------------------------- | --------------- | ----- |
| `POST → ParseNullableNumber`       | cross_community | 5     |
| `Load → GetSortExpression`         | cross_community | 5     |
| `Load → IsSnapshotRecord`          | intra_community | 5     |
| `Load → ParseNullableNumber`       | intra_community | 5     |
| `POST → ParseNullableNumber`       | cross_community | 5     |
| `Load → FormatDate`                | cross_community | 4     |
| `Load → SubtractDays`              | cross_community | 4     |
| `Load → ParseLookbackDays`         | cross_community | 4     |
| `Load → ParseNullableNumber`       | cross_community | 4     |
| `Load → GetMissingOffersSinceDate` | cross_community | 4     |

## Connected Areas

| Area              | Connections |
| ----------------- | ----------- |
| Aggregator-offers | 11 calls    |
| Server            | 9 calls     |

## How to Explore

1. `gitnexus_context({name: "listAdminDimOffersRows"})` — see callers and callees
2. `gitnexus_query({query: "services"})` — find related execution flows
3. Read key files listed above for implementation details
