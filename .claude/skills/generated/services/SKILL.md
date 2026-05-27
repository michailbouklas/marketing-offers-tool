---
name: services
description: "Skill for the Services area of marketing-offers-tool. 136 symbols across 33 files."
---

# Services

136 symbols | 33 files | Cohesion: 80%

## When to Use

- Working with code in `src/`
- Understanding how load, load, createOffer work
- Modifying services-related functionality

## Key Files

| File                                                        | Symbols                                                                                                                                             |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/services/offers-data-quality.ts`                   | getBrandAliases, getSelectedBrandAliases, getDefaultGapPricingFormData, applyGapPricingLookupDefaults, mapGapLoadResponseToGapPricingFormData (+12) |
| `src/lib/services/offers-data-quality-postgres.server.ts`   | listGapRecords, listChannels, getPendingStagingRecordByItemCode, getGapRecordById, listPendingStagingRecords (+10)                                  |
| `src/lib/services/offers-data-quality.server.ts`            | getOpenGapList, mapPendingSubmission, getPendingGapSubmission, getGapFormData, getPendingGapSubmissionQueue (+9)                                    |
| `src/lib/services/admin-dim-offers.server.ts`               | parseCount, getSortExpression, buildFilterClauses, buildWhereClause, buildBaseQueryParams (+9)                                                      |
| `src/lib/services/offers-data-quality-clickhouse.server.ts` | parseNullableNumber, getCurrentDimOfferValues, formatNullableFixedNumber, getDimOfferAuditSnapshot, insertDimOffer (+7)                             |
| `src/lib/services/offers-filter-form.ts`                    | mapOffersFilterFormToFilters, applyLifecyclePreset, toStartOfDay, toEndOfDay, toLocalStartOfDay (+3)                                                |
| `src/lib/services/dim-offers-audit.server.ts`               | listChangedFields, createDimOffersAuditRecord, parseNullableNumber, isSnapshotRecord, mapSnapshotToAdminRow (+1)                                    |
| `src/lib/services/users.server.ts`                          | listUsers, normalizeRole, createUser, updateUser, validateBrandIds (+1)                                                                             |
| `src/lib/services/offer-editor-form.ts`                     | mapOfferEditorFormToCreateInput, getDefaultOfferEditorFormData, mapOfferToEditorFormDefaults, toDateTimeLocalValue, pad                             |
| `src/lib/services/user-editor-form.ts`                      | getDefaultCreateUserFormData, getDefaultEditUserFormData, normalizeUserRole, normalizeBrandIds                                                      |

## Entry Points

Start here when exploring this area:

- **`load`** (Function) — `src/routes/offers-data-quality/+page.server.ts:20`
- **`load`** (Function) — `src/routes/image-generator/+page.server.ts:5`
- **`createOffer`** (Function) — `src/routes/aggregator-offers/+page.server.ts:62`
- **`updateOffer`** (Function) — `src/routes/aggregator-offers/+page.server.ts:86`
- **`getBrandAliases`** (Function) — `src/lib/services/offers-data-quality.ts:381`

## Key Symbols

| Symbol                                   | Type     | File                                                      | Line |
| ---------------------------------------- | -------- | --------------------------------------------------------- | ---- |
| `load`                                   | Function | `src/routes/offers-data-quality/+page.server.ts`          | 20   |
| `load`                                   | Function | `src/routes/image-generator/+page.server.ts`              | 5    |
| `createOffer`                            | Function | `src/routes/aggregator-offers/+page.server.ts`            | 62   |
| `updateOffer`                            | Function | `src/routes/aggregator-offers/+page.server.ts`            | 86   |
| `getBrandAliases`                        | Function | `src/lib/services/offers-data-quality.ts`                 | 381  |
| `getSelectedBrandAliases`                | Function | `src/lib/services/offers-data-quality.ts`                 | 387  |
| `getOpenGapList`                         | Function | `src/lib/services/offers-data-quality.server.ts`          | 245  |
| `listGapRecords`                         | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 91   |
| `mapOfferEditorFormToCreateInput`        | Function | `src/lib/services/offer-editor-form.ts`                   | 78   |
| `listBrandsForUser`                      | Function | `src/lib/services/brands.server.ts`                       | 25   |
| `requireAuthenticatedUser`               | Function | `src/lib/server/auth-guards.ts`                           | 5    |
| `GET`                                    | Function | `src/routes/api/gaps/+server.ts`                          | 20   |
| `listAdminDimOffersRows`                 | Function | `src/lib/services/admin-dim-offers.server.ts`             | 297  |
| `listAdminDimOffersPage`                 | Function | `src/lib/services/admin-dim-offers.server.ts`             | 382  |
| `getDefaultGapPricingFormData`           | Function | `src/lib/services/offers-data-quality.ts`                 | 272  |
| `applyGapPricingLookupDefaults`          | Function | `src/lib/services/offers-data-quality.ts`                 | 285  |
| `mapGapLoadResponseToGapPricingFormData` | Function | `src/lib/services/offers-data-quality.ts`                 | 309  |
| `getPendingGapSubmission`                | Function | `src/lib/services/offers-data-quality.server.ts`          | 174  |
| `listChannels`                           | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 37   |
| `getPendingStagingRecordByItemCode`      | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 126  |

## Execution Flows

| Flow                         | Type            | Steps |
| ---------------------------- | --------------- | ----- |
| `Load → LoadEnvFileValues`   | cross_community | 6     |
| `POST → ParseNullableNumber` | cross_community | 5     |
| `Load → GetSortExpression`   | cross_community | 5     |
| `Load → IsSnapshotRecord`    | intra_community | 5     |
| `Load → ParseNullableNumber` | intra_community | 5     |
| `POST → ParseNullableNumber` | cross_community | 5     |
| `Load → FormatDate`          | cross_community | 4     |
| `Load → SubtractDays`        | cross_community | 4     |
| `Load → ParseLookbackDays`   | cross_community | 4     |
| `Load → ParseNullableNumber` | cross_community | 4     |

## Connected Areas

| Area   | Connections |
| ------ | ----------- |
| Server | 9 calls     |
| [id]   | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "load"})` — see callers and callees
2. `gitnexus_query({query: "services"})` — find related execution flows
3. Read key files listed above for implementation details
