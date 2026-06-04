---
name: services
description: "Skill for the Services area of marketing-offers-tool. 141 symbols across 37 files."
---

# Services

141 symbols | 37 files | Cohesion: 80%

## When to Use

- Working with code in `src/`
- Understanding how getDefaultGapPricingFormData, applyGapPricingLookupDefaults, mapGapLoadResponseToGapPricingFormData work
- Modifying services-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/services/offers-data-quality.ts` | getDefaultGapPricingFormData, applyGapPricingLookupDefaults, mapGapLoadResponseToGapPricingFormData, formatInputNumber, formatPricingDecimal (+12) |
| `src/lib/services/offers-data-quality-postgres.server.ts` | listChannels, listPricingCategories, listPricingSubcategoriesByCategoryId, getGapRecordById, getStagingRecordById (+11) |
| `src/lib/services/offers-data-quality.server.ts` | getGapFormData, approveGapSubmission, rejectGapSubmission, mapPendingSubmission, getPendingGapSubmission (+9) |
| `src/lib/services/admin-dim-offers.server.ts` | parseCount, getSortExpression, buildFilterClauses, buildWhereClause, buildBaseQueryParams (+9) |
| `src/lib/services/offers-data-quality-clickhouse.server.ts` | insertDimOffer, updateDimOffer, parseNullableNumber, formatNullableFixedNumber, getMissingOffersSinceDate (+8) |
| `src/lib/services/offers-filter-form.ts` | mapOffersFilterFormToFilters, applyLifecyclePreset, toStartOfDay, toEndOfDay, toLocalStartOfDay (+3) |
| `src/lib/services/users.server.ts` | listUsers, normalizeRoles, countUsers, createUser, updateUser (+2) |
| `src/lib/services/dim-offers-audit.server.ts` | listChangedFields, createDimOffersAuditRecord, parseNullableNumber, isSnapshotRecord, mapSnapshotToAdminRow (+1) |
| `src/lib/services/user-editor-form.ts` | getDefaultCreateUserFormData, getDefaultEditUserFormData, normalizeUserRoles, normalizeBrandIds |
| `src/lib/services/offer-editor-form.ts` | getDefaultOfferEditorFormData, mapOfferToEditorFormDefaults, toDateTimeLocalValue, pad |

## Entry Points

Start here when exploring this area:

- **`getDefaultGapPricingFormData`** (Function) — `src/lib/services/offers-data-quality.ts:272`
- **`applyGapPricingLookupDefaults`** (Function) — `src/lib/services/offers-data-quality.ts:285`
- **`mapGapLoadResponseToGapPricingFormData`** (Function) — `src/lib/services/offers-data-quality.ts:309`
- **`getGapFormData`** (Function) — `src/lib/services/offers-data-quality.server.ts:150`
- **`listChannels`** (Function) — `src/lib/services/offers-data-quality-postgres.server.ts:37`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getDefaultGapPricingFormData` | Function | `src/lib/services/offers-data-quality.ts` | 272 |
| `applyGapPricingLookupDefaults` | Function | `src/lib/services/offers-data-quality.ts` | 285 |
| `mapGapLoadResponseToGapPricingFormData` | Function | `src/lib/services/offers-data-quality.ts` | 309 |
| `getGapFormData` | Function | `src/lib/services/offers-data-quality.server.ts` | 150 |
| `listChannels` | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 37 |
| `listPricingCategories` | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 47 |
| `listPricingSubcategoriesByCategoryId` | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 57 |
| `getGapRecordById` | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 72 |
| `requireAuthenticatedUser` | Function | `src/lib/server/auth-guards.ts` | 7 |
| `load` | Function | `src/routes/offers-data-quality/[id]/+page.server.ts` | 22 |
| `GET` | Function | `src/routes/api/subcategories/+server.ts` | 6 |
| `GET` | Function | `src/routes/api/channels/+server.ts` | 5 |
| `GET` | Function | `src/routes/api/categories/+server.ts` | 5 |
| `GET` | Function | `src/routes/api/gaps/[id]/+server.ts` | 19 |
| `approveGapSubmission` | Function | `src/lib/services/offers-data-quality.server.ts` | 390 |
| `rejectGapSubmission` | Function | `src/lib/services/offers-data-quality.server.ts` | 469 |
| `getStagingRecordById` | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 118 |
| `updateDimOffersStagingStatus` | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 192 |
| `updateGapRecordStatus` | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 209 |
| `insertDimOffer` | Function | `src/lib/services/offers-data-quality-clickhouse.server.ts` | 436 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `POST → ParseNullableNumber` | cross_community | 5 |
| `Load → ParseRoles` | cross_community | 5 |
| `Load → GetSortExpression` | cross_community | 5 |
| `Load → IsSnapshotRecord` | intra_community | 5 |
| `Load → ParseNullableNumber` | intra_community | 5 |
| `POST → ParseNullableNumber` | cross_community | 5 |
| `Load → FormatDate` | cross_community | 4 |
| `Load → SubtractDays` | cross_community | 4 |
| `Load → ParseLookbackDays` | cross_community | 4 |
| `Load → ParseNullableNumber` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Server | 6 calls |
| Aggregator-offers | 6 calls |
| Image-generator | 1 calls |
| [id] | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getDefaultGapPricingFormData"})` — see callers and callees
2. `gitnexus_query({query: "services"})` — find related execution flows
3. Read key files listed above for implementation details
