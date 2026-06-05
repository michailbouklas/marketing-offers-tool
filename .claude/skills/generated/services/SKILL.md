---
name: services
description: "Skill for the Services area of marketing-offers-tool. 144 symbols across 38 files."
---

# Services

144 symbols | 38 files | Cohesion: 78%

## When to Use

- Working with code in `src/`
- Understanding how getDefaultGapPricingFormData, applyGapPricingLookupDefaults, mapGapLoadResponseToGapPricingFormData work
- Modifying services-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/services/offers-data-quality.ts` | getDefaultGapPricingFormData, applyGapPricingLookupDefaults, mapGapLoadResponseToGapPricingFormData, formatInputNumber, parseMissingFields (+12) |
| `src/lib/services/offers-data-quality-postgres.server.ts` | listChannels, listPricingCategories, listPricingSubcategoriesByCategoryId, getGapRecordById, getPendingStagingRecordByItemCode (+11) |
| `src/lib/services/offers-data-quality.server.ts` | mapPendingSubmission, getGapFormData, getPendingGapSubmission, getPendingGapSubmissionQueue, ensureGapRecordForItemCode (+9) |
| `src/lib/services/admin-dim-offers.server.ts` | parseCount, getSortExpression, buildFilterClauses, buildWhereClause, buildBaseQueryParams (+9) |
| `src/lib/services/offers-data-quality-clickhouse.server.ts` | parseNullableNumber, getCurrentDimOfferValues, getMissingOffersSinceDate, listMissingOfferQueueRows, getOfferEligibleItemCodes (+8) |
| `src/lib/services/users.server.ts` | getUserSummaryById, countUsers, listUsers, normalizeRoles, createUser (+3) |
| `src/lib/services/offers-filter-form.ts` | mapOffersFilterFormToFilters, applyLifecyclePreset, toStartOfDay, toEndOfDay, toLocalStartOfDay (+3) |
| `src/lib/services/dim-offers-audit.server.ts` | listChangedFields, createDimOffersAuditRecord, parseNullableNumber, isSnapshotRecord, mapSnapshotToAdminRow (+1) |
| `src/lib/services/offer-editor-form.ts` | getDefaultOfferEditorFormData, mapOfferToEditorFormDefaults, toDateTimeLocalValue, pad |
| `src/lib/services/transport-security.ts` | isSecurePasswordSubmissionContext, getInsecurePasswordSubmissionMessage, getBrowserLocation, isLoopbackHost |

## Entry Points

Start here when exploring this area:

- **`getDefaultGapPricingFormData`** (Function) — `src/lib/services/offers-data-quality.ts:272`
- **`applyGapPricingLookupDefaults`** (Function) — `src/lib/services/offers-data-quality.ts:285`
- **`mapGapLoadResponseToGapPricingFormData`** (Function) — `src/lib/services/offers-data-quality.ts:309`
- **`listChannels`** (Function) — `src/lib/services/offers-data-quality-postgres.server.ts:37`
- **`listPricingCategories`** (Function) — `src/lib/services/offers-data-quality-postgres.server.ts:47`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getDefaultGapPricingFormData` | Function | `src/lib/services/offers-data-quality.ts` | 272 |
| `applyGapPricingLookupDefaults` | Function | `src/lib/services/offers-data-quality.ts` | 285 |
| `mapGapLoadResponseToGapPricingFormData` | Function | `src/lib/services/offers-data-quality.ts` | 309 |
| `listChannels` | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 37 |
| `listPricingCategories` | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 47 |
| `listPricingSubcategoriesByCategoryId` | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 57 |
| `requireAuthenticatedUser` | Function | `src/lib/server/auth-guards.ts` | 12 |
| `load` | Function | `src/routes/offers-data-quality/[id]/+page.server.ts` | 22 |
| `load` | Function | `src/routes/image-generator/inspiration/+page.server.ts` | 5 |
| `GET` | Function | `src/routes/api/subcategories/+server.ts` | 6 |
| `GET` | Function | `src/routes/api/channels/+server.ts` | 5 |
| `GET` | Function | `src/routes/api/categories/+server.ts` | 5 |
| `parseMissingFields` | Function | `src/lib/services/offers-data-quality.ts` | 350 |
| `getGapFormData` | Function | `src/lib/services/offers-data-quality.server.ts` | 150 |
| `getPendingGapSubmission` | Function | `src/lib/services/offers-data-quality.server.ts` | 176 |
| `getPendingGapSubmissionQueue` | Function | `src/lib/services/offers-data-quality.server.ts` | 197 |
| `getGapRecordById` | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 72 |
| `getPendingStagingRecordByItemCode` | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 126 |
| `listPendingStagingRecords` | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 136 |
| `getCurrentDimOfferValues` | Function | `src/lib/services/offers-data-quality-clickhouse.server.ts` | 194 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Load → GetDateRange` | cross_community | 5 |
| `Load → AssertSafeKey` | cross_community | 5 |
| `Load → From` | cross_community | 5 |
| `Load → LoadEnvFileValues` | cross_community | 5 |
| `POST → ParseNullableNumber` | cross_community | 5 |
| `Load → ParseRoles` | cross_community | 5 |
| `Load → GetSortExpression` | cross_community | 5 |
| `Load → IsSnapshotRecord` | intra_community | 5 |
| `Load → ParseNullableNumber` | intra_community | 5 |
| `POST → ParseNullableNumber` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Server | 14 calls |
| Image-generator | 2 calls |

## How to Explore

1. `gitnexus_context({name: "getDefaultGapPricingFormData"})` — see callers and callees
2. `gitnexus_query({query: "services"})` — find related execution flows
3. Read key files listed above for implementation details
