---
name: services
description: "Skill for the Services area of marketing-offers-tool. 131 symbols across 31 files."
---

# Services

131 symbols | 31 files | Cohesion: 81%

## When to Use

- Working with code in `src/`
- Understanding how listAdminDimOffersRows, listAdminDimOffersPage, getDefaultGapPricingFormData work
- Modifying services-related functionality

## Key Files

| File                                                        | Symbols                                                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/services/offers-data-quality.ts`                   | getDefaultGapPricingFormData, applyGapPricingLookupDefaults, mapGapLoadResponseToGapPricingFormData, formatInputNumber, parseMissingFields (+12) |
| `src/lib/services/offers-data-quality-postgres.server.ts`   | listChannels, getPendingStagingRecordByItemCode, getGapRecordById, listPendingStagingRecords, listGapRecords (+10)                               |
| `src/lib/services/admin-dim-offers.server.ts`               | parseCount, getSortExpression, buildFilterClauses, buildWhereClause, buildBaseQueryParams (+9)                                                   |
| `src/lib/services/offers-data-quality.server.ts`            | mapPendingSubmission, getPendingGapSubmission, getGapFormData, getPendingGapSubmissionQueue, getOpenGapList (+8)                                 |
| `src/lib/services/offers-data-quality-clickhouse.server.ts` | parseNullableNumber, getCurrentDimOfferValues, getOfferEligibleItemCodes, formatNullableFixedNumber, getDimOfferAuditSnapshot (+8)               |
| `src/lib/services/offers-filter-form.ts`                    | mapOffersFilterFormToFilters, applyLifecyclePreset, toStartOfDay, toEndOfDay, toLocalStartOfDay (+3)                                             |
| `src/lib/services/dim-offers-audit.server.ts`               | listChangedFields, createDimOffersAuditRecord, parseNullableNumber, isSnapshotRecord, mapSnapshotToAdminRow (+1)                                 |
| `src/lib/services/users.server.ts`                          | listUsers, normalizeRole, createUser, updateUser, validateBrandIds (+1)                                                                          |
| `src/lib/services/user-editor-form.ts`                      | getDefaultCreateUserFormData, getDefaultEditUserFormData, normalizeUserRole, normalizeBrandIds                                                   |
| `src/lib/services/home-offer-widgets.ts`                    | getStartOfDay, getEndOfDay, addDays, getHomeOfferWidgets                                                                                         |

## Entry Points

Start here when exploring this area:

- **`listAdminDimOffersRows`** (Function) — `src/lib/services/admin-dim-offers.server.ts:297`
- **`listAdminDimOffersPage`** (Function) — `src/lib/services/admin-dim-offers.server.ts:382`
- **`getDefaultGapPricingFormData`** (Function) — `src/lib/services/offers-data-quality.ts:272`
- **`applyGapPricingLookupDefaults`** (Function) — `src/lib/services/offers-data-quality.ts:285`
- **`mapGapLoadResponseToGapPricingFormData`** (Function) — `src/lib/services/offers-data-quality.ts:309`

## Key Symbols

| Symbol                                   | Type     | File                                                        | Line |
| ---------------------------------------- | -------- | ----------------------------------------------------------- | ---- |
| `listAdminDimOffersRows`                 | Function | `src/lib/services/admin-dim-offers.server.ts`               | 297  |
| `listAdminDimOffersPage`                 | Function | `src/lib/services/admin-dim-offers.server.ts`               | 382  |
| `getDefaultGapPricingFormData`           | Function | `src/lib/services/offers-data-quality.ts`                   | 272  |
| `applyGapPricingLookupDefaults`          | Function | `src/lib/services/offers-data-quality.ts`                   | 285  |
| `mapGapLoadResponseToGapPricingFormData` | Function | `src/lib/services/offers-data-quality.ts`                   | 309  |
| `getPendingGapSubmission`                | Function | `src/lib/services/offers-data-quality.server.ts`            | 175  |
| `listChannels`                           | Function | `src/lib/services/offers-data-quality-postgres.server.ts`   | 37   |
| `getPendingStagingRecordByItemCode`      | Function | `src/lib/services/offers-data-quality-postgres.server.ts`   | 126  |
| `load`                                   | Function | `src/routes/offers-data-quality/[id]/+page.server.ts`       | 22   |
| `GET`                                    | Function | `src/routes/api/channels/+server.ts`                        | 5    |
| `parseMissingFields`                     | Function | `src/lib/services/offers-data-quality.ts`                   | 350  |
| `getGapFormData`                         | Function | `src/lib/services/offers-data-quality.server.ts`            | 149  |
| `getPendingGapSubmissionQueue`           | Function | `src/lib/services/offers-data-quality.server.ts`            | 187  |
| `getGapRecordById`                       | Function | `src/lib/services/offers-data-quality-postgres.server.ts`   | 72   |
| `listPendingStagingRecords`              | Function | `src/lib/services/offers-data-quality-postgres.server.ts`   | 136  |
| `getCurrentDimOfferValues`               | Function | `src/lib/services/offers-data-quality-clickhouse.server.ts` | 194  |
| `load`                                   | Function | `src/routes/admin/pending-submissions/+page.server.ts`      | 4    |
| `GET`                                    | Function | `src/routes/api/gaps/[id]/+server.ts`                       | 19   |
| `getBrandAliases`                        | Function | `src/lib/services/offers-data-quality.ts`                   | 381  |
| `getSelectedBrandAliases`                | Function | `src/lib/services/offers-data-quality.ts`                   | 387  |

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
