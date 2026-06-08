---
name: services
description: "Skill for the Services area of marketing-offers-tool. 165 symbols across 46 files."
---

# Services

165 symbols | 46 files | Cohesion: 76%

## When to Use

- Working with code in `src/`
- Understanding how requirePermission, getDefaultCreateUserFormData, mapOfferEditorFormToCreateInput work
- Modifying services-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/services/offers-data-quality.ts` | parseMissingFields, getDefaultGapPricingFormData, applyGapPricingLookupDefaults, mapGapLoadResponseToGapPricingFormData, formatInputNumber (+12) |
| `src/lib/services/offers-data-quality-postgres.server.ts` | getStagingRecordById, updateDimOffersStagingStatus, updateGapRecordStatus, getGapRecordById, listPendingStagingRecords (+11) |
| `src/lib/services/offers-data-quality.server.ts` | approveGapSubmission, rejectGapSubmission, getGapFormData, getPendingGapSubmissionQueue, mapPendingSubmission (+9) |
| `src/lib/services/admin-dim-offers.server.ts` | parseCount, getSortExpression, buildFilterClauses, buildWhereClause, buildBaseQueryParams (+9) |
| `src/lib/services/offers-data-quality-clickhouse.server.ts` | insertDimOffer, updateDimOffer, parseNullableNumber, formatNullableFixedNumber, getCurrentDimOfferValues (+8) |
| `src/lib/services/offers-filter-form.ts` | getOffersFilterFormData, mapOffersFilterFormToFilters, applyLifecyclePreset, toStartOfDay, toEndOfDay (+3) |
| `src/lib/services/users.server.ts` | countUsers, listUsers, normalizeRoles, createUser, updateUser (+2) |
| `src/lib/server/auth-guards.ts` | requirePermission, requireApiAdminPermission, requireAuthenticatedUser, requireAdminSection, hasPermission (+1) |
| `src/lib/services/dim-offers-audit.server.ts` | listChangedFields, createDimOffersAuditRecord, parseNullableNumber, isSnapshotRecord, mapSnapshotToAdminRow (+1) |
| `src/lib/services/offer-editor-form.ts` | mapOfferEditorFormToCreateInput, getDefaultOfferEditorFormData, mapOfferToEditorFormDefaults, toDateTimeLocalValue, pad |

## Entry Points

Start here when exploring this area:

- **`requirePermission`** (Function) — `src/lib/server/auth-guards.ts:137`
- **`getDefaultCreateUserFormData`** (Function) — `src/lib/services/user-editor-form.ts:100`
- **`mapOfferEditorFormToCreateInput`** (Function) — `src/lib/services/offer-editor-form.ts:78`
- **`listBrands`** (Function) — `src/lib/services/brands.server.ts:7`
- **`createOffer`** (Function) — `src/routes/aggregator-offers/+page.server.ts:68`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `requirePermission` | Function | `src/lib/server/auth-guards.ts` | 137 |
| `getDefaultCreateUserFormData` | Function | `src/lib/services/user-editor-form.ts` | 100 |
| `mapOfferEditorFormToCreateInput` | Function | `src/lib/services/offer-editor-form.ts` | 78 |
| `listBrands` | Function | `src/lib/services/brands.server.ts` | 7 |
| `createOffer` | Function | `src/routes/aggregator-offers/+page.server.ts` | 68 |
| `updateOffer` | Function | `src/routes/aggregator-offers/+page.server.ts` | 92 |
| `setRestaurantPref` | Function | `src/lib/services/competition/preferences.server.ts` | 31 |
| `addMonitor` | Function | `src/routes/google-reviews/businesses/+page.server.ts` | 113 |
| `removeMonitor` | Function | `src/routes/google-reviews/businesses/+page.server.ts` | 136 |
| `toggleTrack` | Function | `src/routes/competition/restaurants/+page.server.ts` | 124 |
| `addMonitor` | Function | `src/routes/competition/restaurants/+page.server.ts` | 153 |
| `removeMonitor` | Function | `src/routes/competition/restaurants/+page.server.ts` | 174 |
| `load` | Function | `src/routes/admin/users/+page.server.ts` | 15 |
| `createUser` | Function | `src/routes/admin/users/+page.server.ts` | 42 |
| `updateUser` | Function | `src/routes/admin/users/+page.server.ts` | 74 |
| `load` | Function | `src/routes/admin/dim-offers/+page.server.ts` | 35 |
| `load` | Function | `src/routes/admin/brands/+page.server.ts` | 5 |
| `GET` | Function | `src/routes/admin/dim-offers/export/+server.ts` | 53 |
| `requireApiAdminPermission` | Function | `src/lib/server/auth-guards.ts` | 171 |
| `approveGapSubmission` | Function | `src/lib/services/offers-data-quality.server.ts` | 390 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Load → AssertSafeKey` | cross_community | 5 |
| `Load → From` | cross_community | 5 |
| `Load → LoadEnvFileValues` | cross_community | 5 |
| `POST → ParseNullableNumber` | cross_community | 5 |
| `Load → ParseRoles` | cross_community | 5 |
| `Load → GetSortExpression` | cross_community | 5 |
| `Load → IsSnapshotRecord` | intra_community | 5 |
| `Load → ParseNullableNumber` | intra_community | 5 |
| `POST → ParseNullableNumber` | cross_community | 5 |
| `Load → FormatDate` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Server | 8 calls |
| Image-generator | 1 calls |
| Inspiration | 1 calls |

## How to Explore

1. `gitnexus_context({name: "requirePermission"})` — see callers and callees
2. `gitnexus_query({query: "services"})` — find related execution flows
3. Read key files listed above for implementation details
