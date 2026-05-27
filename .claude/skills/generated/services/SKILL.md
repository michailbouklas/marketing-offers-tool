---
name: services
description: "Skill for the Services area of marketing-offers-tool. 131 symbols across 31 files."
---

# Services

131 symbols | 31 files | Cohesion: 83%

## When to Use

- Working with code in `src/`
- Understanding how approveGapSubmission, rejectGapSubmission, getStagingRecordById work
- Modifying services-related functionality

## Key Files

| File                                                        | Symbols                                                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/services/offers-data-quality.ts`                   | getDefaultGapPricingFormData, applyGapPricingLookupDefaults, mapGapLoadResponseToGapPricingFormData, formatInputNumber, parseMissingFields (+12) |
| `src/lib/services/offers-data-quality-postgres.server.ts`   | getStagingRecordById, updateDimOffersStagingStatus, updateGapRecordStatus, listChannels, getPendingStagingRecordByItemCode (+10)                 |
| `src/lib/services/offers-data-quality.server.ts`            | approveGapSubmission, rejectGapSubmission, mapPendingSubmission, getPendingGapSubmission, getGapFormData (+9)                                    |
| `src/lib/services/admin-dim-offers.server.ts`               | parseCount, getSortExpression, buildFilterClauses, buildWhereClause, buildBaseQueryParams (+9)                                                   |
| `src/lib/services/offers-data-quality-clickhouse.server.ts` | insertDimOffer, updateDimOffer, parseNullableNumber, formatNullableFixedNumber, getCurrentDimOfferValues (+7)                                    |
| `src/lib/services/offers-filter-form.ts`                    | mapOffersFilterFormToFilters, applyLifecyclePreset, toStartOfDay, toEndOfDay, toLocalStartOfDay (+3)                                             |
| `src/lib/services/dim-offers-audit.server.ts`               | listChangedFields, createDimOffersAuditRecord, parseNullableNumber, isSnapshotRecord, mapSnapshotToAdminRow (+1)                                 |
| `src/lib/services/users.server.ts`                          | listUsers, normalizeRole, createUser, updateUser, validateBrandIds (+1)                                                                          |
| `src/lib/services/user-editor-form.ts`                      | getDefaultCreateUserFormData, getDefaultEditUserFormData, normalizeUserRole, normalizeBrandIds                                                   |
| `src/lib/services/home-offer-widgets.ts`                    | getStartOfDay, getEndOfDay, addDays, getHomeOfferWidgets                                                                                         |

## Entry Points

Start here when exploring this area:

- **`approveGapSubmission`** (Function) — `src/lib/services/offers-data-quality.server.ts:332`
- **`rejectGapSubmission`** (Function) — `src/lib/services/offers-data-quality.server.ts:411`
- **`getStagingRecordById`** (Function) — `src/lib/services/offers-data-quality-postgres.server.ts:118`
- **`updateDimOffersStagingStatus`** (Function) — `src/lib/services/offers-data-quality-postgres.server.ts:184`
- **`updateGapRecordStatus`** (Function) — `src/lib/services/offers-data-quality-postgres.server.ts:201`

## Key Symbols

| Symbol                                   | Type     | File                                                             | Line |
| ---------------------------------------- | -------- | ---------------------------------------------------------------- | ---- |
| `approveGapSubmission`                   | Function | `src/lib/services/offers-data-quality.server.ts`                 | 332  |
| `rejectGapSubmission`                    | Function | `src/lib/services/offers-data-quality.server.ts`                 | 411  |
| `getStagingRecordById`                   | Function | `src/lib/services/offers-data-quality-postgres.server.ts`        | 118  |
| `updateDimOffersStagingStatus`           | Function | `src/lib/services/offers-data-quality-postgres.server.ts`        | 184  |
| `updateGapRecordStatus`                  | Function | `src/lib/services/offers-data-quality-postgres.server.ts`        | 201  |
| `insertDimOffer`                         | Function | `src/lib/services/offers-data-quality-clickhouse.server.ts`      | 377  |
| `updateDimOffer`                         | Function | `src/lib/services/offers-data-quality-clickhouse.server.ts`      | 400  |
| `createDimOffersAuditRecord`             | Function | `src/lib/services/dim-offers-audit.server.ts`                    | 32   |
| `POST`                                   | Function | `src/routes/api/gaps/submissions/bulk/+server.ts`                | 12   |
| `POST`                                   | Function | `src/routes/api/gaps/submissions/[stagingId]/reject/+server.ts`  | 10   |
| `POST`                                   | Function | `src/routes/api/gaps/submissions/[stagingId]/approve/+server.ts` | 10   |
| `listAdminDimOffersRows`                 | Function | `src/lib/services/admin-dim-offers.server.ts`                    | 297  |
| `listAdminDimOffersPage`                 | Function | `src/lib/services/admin-dim-offers.server.ts`                    | 382  |
| `getDefaultGapPricingFormData`           | Function | `src/lib/services/offers-data-quality.ts`                        | 272  |
| `applyGapPricingLookupDefaults`          | Function | `src/lib/services/offers-data-quality.ts`                        | 285  |
| `mapGapLoadResponseToGapPricingFormData` | Function | `src/lib/services/offers-data-quality.ts`                        | 309  |
| `getPendingGapSubmission`                | Function | `src/lib/services/offers-data-quality.server.ts`                 | 174  |
| `listChannels`                           | Function | `src/lib/services/offers-data-quality-postgres.server.ts`        | 37   |
| `getPendingStagingRecordByItemCode`      | Function | `src/lib/services/offers-data-quality-postgres.server.ts`        | 126  |
| `load`                                   | Function | `src/routes/offers-data-quality/[id]/+page.server.ts`            | 22   |

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

1. `gitnexus_context({name: "approveGapSubmission"})` — see callers and callees
2. `gitnexus_query({query: "services"})` — find related execution flows
3. Read key files listed above for implementation details
