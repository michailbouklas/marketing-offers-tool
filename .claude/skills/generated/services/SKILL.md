---
name: services
description: "Skill for the Services area of marketing-offers-tool. 156 symbols across 41 files."
---

# Services

156 symbols | 41 files | Cohesion: 80%

## When to Use

- Working with code in `src/`
- Understanding how parseMissingFields, getGapFormData, getPendingGapSubmission work
- Modifying services-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/services/offers-data-quality.ts` | parseMissingFields, getDefaultGapPricingFormData, applyGapPricingLookupDefaults, mapGapLoadResponseToGapPricingFormData, formatInputNumber (+12) |
| `src/lib/services/offers-data-quality-postgres.server.ts` | getGapRecordById, getPendingStagingRecordByItemCode, listPendingStagingRecords, listChannels, listPricingCategories (+11) |
| `src/lib/services/offers-data-quality.server.ts` | mapPendingSubmission, getGapFormData, getPendingGapSubmission, getPendingGapSubmissionQueue, approveGapSubmission (+9) |
| `src/lib/services/admin-dim-offers.server.ts` | parseCount, getSortExpression, buildFilterClauses, buildWhereClause, buildBaseQueryParams (+9) |
| `src/lib/services/offers-data-quality-clickhouse.server.ts` | parseNullableNumber, formatNullableFixedNumber, getCurrentDimOfferValues, getDimOfferAuditSnapshot, insertDimOffer (+8) |
| `src/lib/services/offers-filter-form.ts` | mapOffersFilterFormToFilters, applyLifecyclePreset, toStartOfDay, toEndOfDay, toLocalStartOfDay (+3) |
| `src/lib/services/users.server.ts` | countUsers, listUsers, normalizeRoles, createUser, updateUser (+2) |
| `src/lib/services/dim-offers-audit.server.ts` | listChangedFields, createDimOffersAuditRecord, parseNullableNumber, isSnapshotRecord, mapSnapshotToAdminRow (+1) |
| `src/lib/services/offer-editor-form.ts` | mapOfferEditorFormToCreateInput, getDefaultOfferEditorFormData, mapOfferToEditorFormDefaults, toDateTimeLocalValue, pad |
| `src/lib/server/auth-guards.ts` | requirePermission, requireAuthenticatedUser, requireApiAdminPermission, hasPermission, requireAdminUser |

## Entry Points

Start here when exploring this area:

- **`parseMissingFields`** (Function) — `src/lib/services/offers-data-quality.ts:350`
- **`getGapFormData`** (Function) — `src/lib/services/offers-data-quality.server.ts:150`
- **`getPendingGapSubmission`** (Function) — `src/lib/services/offers-data-quality.server.ts:176`
- **`getPendingGapSubmissionQueue`** (Function) — `src/lib/services/offers-data-quality.server.ts:197`
- **`getGapRecordById`** (Function) — `src/lib/services/offers-data-quality-postgres.server.ts:72`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `parseMissingFields` | Function | `src/lib/services/offers-data-quality.ts` | 350 |
| `getGapFormData` | Function | `src/lib/services/offers-data-quality.server.ts` | 150 |
| `getPendingGapSubmission` | Function | `src/lib/services/offers-data-quality.server.ts` | 176 |
| `getPendingGapSubmissionQueue` | Function | `src/lib/services/offers-data-quality.server.ts` | 197 |
| `getGapRecordById` | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 72 |
| `getPendingStagingRecordByItemCode` | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 126 |
| `listPendingStagingRecords` | Function | `src/lib/services/offers-data-quality-postgres.server.ts` | 136 |
| `getCurrentDimOfferValues` | Function | `src/lib/services/offers-data-quality-clickhouse.server.ts` | 194 |
| `getDimOfferAuditSnapshot` | Function | `src/lib/services/offers-data-quality-clickhouse.server.ts` | 243 |
| `load` | Function | `src/routes/admin/pending-submissions/+page.server.ts` | 4 |
| `GET` | Function | `src/routes/api/gaps/[id]/+server.ts` | 19 |
| `createOffer` | Function | `src/routes/aggregator-offers/+page.server.ts` | 68 |
| `updateOffer` | Function | `src/routes/aggregator-offers/+page.server.ts` | 92 |
| `getDefaultCreateUserFormData` | Function | `src/lib/services/user-editor-form.ts` | 100 |
| `mapOfferEditorFormToCreateInput` | Function | `src/lib/services/offer-editor-form.ts` | 78 |
| `listBrands` | Function | `src/lib/services/brands.server.ts` | 7 |
| `requirePermission` | Function | `src/lib/server/auth-guards.ts` | 102 |
| `load` | Function | `src/routes/admin/users/+page.server.ts` | 15 |
| `createUser` | Function | `src/routes/admin/users/+page.server.ts` | 42 |
| `updateUser` | Function | `src/routes/admin/users/+page.server.ts` | 74 |

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
| Server | 5 calls |
| Image-generator | 1 calls |
| [id] | 1 calls |

## How to Explore

1. `gitnexus_context({name: "parseMissingFields"})` — see callers and callees
2. `gitnexus_query({query: "services"})` — find related execution flows
3. Read key files listed above for implementation details
