---
name: services
description: "Skill for the Services area of marketing-offers-tool. 162 symbols across 45 files."
---

# Services

162 symbols | 45 files | Cohesion: 76%

## When to Use

- Working with code in `src/`
- Understanding how createOffer, updateOffer, getDefaultCreateUserFormData work
- Modifying services-related functionality

## Key Files

| File                                                        | Symbols                                                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/services/offers-data-quality.ts`                   | getDefaultGapPricingFormData, applyGapPricingLookupDefaults, mapGapLoadResponseToGapPricingFormData, formatInputNumber, parseMissingFields (+12) |
| `src/lib/services/offers-data-quality-postgres.server.ts`   | listChannels, listPricingCategories, listPricingSubcategoriesByCategoryId, getGapRecordById, getPendingStagingRecordByItemCode (+11)             |
| `src/lib/services/offers-data-quality.server.ts`            | mapPendingSubmission, getGapFormData, getPendingGapSubmission, getPendingGapSubmissionQueue, ensureGapRecordForItemCode (+9)                     |
| `src/lib/services/admin-dim-offers.server.ts`               | parseCount, getSortExpression, buildFilterClauses, buildWhereClause, buildBaseQueryParams (+9)                                                   |
| `src/lib/services/offers-data-quality-clickhouse.server.ts` | parseNullableNumber, getCurrentDimOfferValues, getMissingOffersSinceDate, listMissingOfferQueueRows, getOfferEligibleItemCodes (+8)              |
| `src/lib/services/offers-filter-form.ts`                    | mapOffersFilterFormToFilters, applyLifecyclePreset, toStartOfDay, toEndOfDay, toLocalStartOfDay (+3)                                             |
| `src/lib/services/users.server.ts`                          | countUsers, listUsers, normalizeRoles, createUser, updateUser (+2)                                                                               |
| `src/lib/services/dim-offers-audit.server.ts`               | listChangedFields, createDimOffersAuditRecord, parseNullableNumber, isSnapshotRecord, mapSnapshotToAdminRow (+1)                                 |
| `src/lib/services/offer-editor-form.ts`                     | mapOfferEditorFormToCreateInput, getDefaultOfferEditorFormData, mapOfferToEditorFormDefaults, toDateTimeLocalValue, pad                          |
| `src/lib/services/user-editor-form.ts`                      | getDefaultCreateUserFormData, getDefaultEditUserFormData, normalizeUserRoles, normalizeBrandIds                                                  |

## Entry Points

Start here when exploring this area:

- **`createOffer`** (Function) — `src/routes/aggregator-offers/+page.server.ts:68`
- **`updateOffer`** (Function) — `src/routes/aggregator-offers/+page.server.ts:92`
- **`getDefaultCreateUserFormData`** (Function) — `src/lib/services/user-editor-form.ts:100`
- **`mapOfferEditorFormToCreateInput`** (Function) — `src/lib/services/offer-editor-form.ts:78`
- **`listBrands`** (Function) — `src/lib/services/brands.server.ts:7`

## Key Symbols

| Symbol                            | Type     | File                                                   | Line |
| --------------------------------- | -------- | ------------------------------------------------------ | ---- |
| `createOffer`                     | Function | `src/routes/aggregator-offers/+page.server.ts`         | 68   |
| `updateOffer`                     | Function | `src/routes/aggregator-offers/+page.server.ts`         | 92   |
| `getDefaultCreateUserFormData`    | Function | `src/lib/services/user-editor-form.ts`                 | 100  |
| `mapOfferEditorFormToCreateInput` | Function | `src/lib/services/offer-editor-form.ts`                | 78   |
| `listBrands`                      | Function | `src/lib/services/brands.server.ts`                    | 7    |
| `requirePermission`               | Function | `src/lib/server/auth-guards.ts`                        | 137  |
| `addMonitor`                      | Function | `src/routes/google-reviews/businesses/+page.server.ts` | 113  |
| `removeMonitor`                   | Function | `src/routes/google-reviews/businesses/+page.server.ts` | 136  |
| `toggleTrack`                     | Function | `src/routes/competition/restaurants/+page.server.ts`   | 124  |
| `addMonitor`                      | Function | `src/routes/competition/restaurants/+page.server.ts`   | 153  |
| `removeMonitor`                   | Function | `src/routes/competition/restaurants/+page.server.ts`   | 174  |
| `load`                            | Function | `src/routes/admin/users/+page.server.ts`               | 15   |
| `createUser`                      | Function | `src/routes/admin/users/+page.server.ts`               | 42   |
| `updateUser`                      | Function | `src/routes/admin/users/+page.server.ts`               | 74   |
| `load`                            | Function | `src/routes/admin/dim-offers/+page.server.ts`          | 35   |
| `load`                            | Function | `src/routes/admin/brands/+page.server.ts`              | 5    |
| `setRestaurantPref`               | Function | `src/lib/services/competition/preferences.server.ts`   | 31   |
| `GET`                             | Function | `src/routes/admin/dim-offers/export/+server.ts`        | 53   |
| `getDefaultGapPricingFormData`    | Function | `src/lib/services/offers-data-quality.ts`              | 272  |
| `applyGapPricingLookupDefaults`   | Function | `src/lib/services/offers-data-quality.ts`              | 285  |

## Execution Flows

| Flow                         | Type            | Steps |
| ---------------------------- | --------------- | ----- |
| `POST → LoadEnvFileValues`   | cross_community | 9     |
| `POST → ParseNullableNumber` | cross_community | 5     |
| `Load → ParseRoles`          | cross_community | 5     |
| `Load → GetSortExpression`   | cross_community | 5     |
| `Load → IsSnapshotRecord`    | intra_community | 5     |
| `Load → ParseNullableNumber` | intra_community | 5     |
| `POST → ParseNullableNumber` | cross_community | 5     |
| `Load → FormatDate`          | cross_community | 4     |
| `Load → SubtractDays`        | cross_community | 4     |
| `Load → ParseLookbackDays`   | cross_community | 4     |

## Connected Areas

| Area            | Connections |
| --------------- | ----------- |
| Server          | 9 calls     |
| Image-generator | 1 calls     |
| Notifications   | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "createOffer"})` — see callers and callees
2. `gitnexus_query({query: "services"})` — find related execution flows
3. Read key files listed above for implementation details
