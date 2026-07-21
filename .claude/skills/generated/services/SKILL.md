---
name: services
description: "Skill for the Services area of marketing-offers-tool. 218 symbols across 69 files."
---

# Services

218 symbols | 69 files | Cohesion: 70%

## When to Use

- Working with code in `src/`
- Understanding how createOffer, updateOffer, listUrlsToScrape work
- Modifying services-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/services/offers-data-quality.ts` | getDefaultGapPricingFormData, applyGapPricingLookupDefaults, mapGapLoadResponseToGapPricingFormData, formatInputNumber, parseMissingFields (+12) |
| `src/lib/services/offers-data-quality-postgres.server.ts` | listChannels, listPricingCategories, listPricingSubcategoriesByCategoryId, getGapRecordById, getPendingStagingRecordByItemCode (+11) |
| `src/lib/services/admin-dim-offers.server.ts` | parseCount, getSortExpression, buildFilterClauses, buildWhereClause, buildBaseQueryParams (+9) |
| `src/lib/services/offers-data-quality.server.ts` | mapPendingSubmission, getGapFormData, getPendingGapSubmission, getPendingGapSubmissionQueue, ensureGapRecordForItemCode (+9) |
| `src/lib/services/offers-data-quality-clickhouse.server.ts` | parseNullableNumber, getCurrentDimOfferValues, getMissingOffersSinceDate, listMissingOfferQueueRows, getOfferEligibleItemCodes (+8) |
| `src/lib/services/brand-entities.server.ts` | getEntityIdsForBrand, assignEntitiesToBrand, unassignEntity, unassignEntities, getBrandRefsByEntityIds (+6) |
| `src/lib/services/offers-filter-form.ts` | getOffersFilterFormData, mapOffersFilterFormToFilters, applyLifecyclePreset, toStartOfDay, toEndOfDay (+3) |
| `src/lib/services/users.server.ts` | countUsers, getUserSummaryById, listUsers, normalizeRoles, createUser (+3) |
| `src/lib/server/auth-guards.ts` | requirePermission, requireAuthenticatedUser, requireApiPermission, requireAdminSection, hasPermission (+2) |
| `src/lib/services/dim-offers-audit.server.ts` | listChangedFields, createDimOffersAuditRecord, parseNullableNumber, isSnapshotRecord, mapSnapshotToAdminRow (+1) |

## Entry Points

Start here when exploring this area:

- **`createOffer`** (Function) — `src/routes/aggregator-offers/+page.server.ts:68`
- **`updateOffer`** (Function) — `src/routes/aggregator-offers/+page.server.ts:92`
- **`listUrlsToScrape`** (Function) — `src/lib/services/urls-to-scrape.server.ts:9`
- **`createUrlToScrape`** (Function) — `src/lib/services/urls-to-scrape.server.ts:24`
- **`createUrlsToScrape`** (Function) — `src/lib/services/urls-to-scrape.server.ts:38`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `createOffer` | Function | `src/routes/aggregator-offers/+page.server.ts` | 68 |
| `updateOffer` | Function | `src/routes/aggregator-offers/+page.server.ts` | 92 |
| `listUrlsToScrape` | Function | `src/lib/services/urls-to-scrape.server.ts` | 9 |
| `createUrlToScrape` | Function | `src/lib/services/urls-to-scrape.server.ts` | 24 |
| `createUrlsToScrape` | Function | `src/lib/services/urls-to-scrape.server.ts` | 38 |
| `getDefaultUrlToScrapeFormData` | Function | `src/lib/services/urls-to-scrape-form.ts` | 55 |
| `mapOfferEditorFormToCreateInput` | Function | `src/lib/services/offer-editor-form.ts` | 83 |
| `requirePermission` | Function | `src/lib/server/auth-guards.ts` | 137 |
| `toggleTrack` | Function | `src/routes/competition/restaurants/+page.server.ts` | 124 |
| `addMonitor` | Function | `src/routes/competition/restaurants/+page.server.ts` | 153 |
| `removeMonitor` | Function | `src/routes/competition/restaurants/+page.server.ts` | 174 |
| `addMonitor` | Function | `src/routes/google-reviews/businesses/+page.server.ts` | 113 |
| `removeMonitor` | Function | `src/routes/google-reviews/businesses/+page.server.ts` | 136 |
| `load` | Function | `src/routes/admin/urls-to-scrape/+page.server.ts` | 18 |
| `createUrl` | Function | `src/routes/admin/urls-to-scrape/+page.server.ts` | 37 |
| `bulkCreateUrls` | Function | `src/routes/admin/urls-to-scrape/+page.server.ts` | 68 |
| `createUser` | Function | `src/routes/admin/users/+page.server.ts` | 42 |
| `updateUser` | Function | `src/routes/admin/users/+page.server.ts` | 74 |
| `setRestaurantPref` | Function | `src/lib/services/competition/preferences.server.ts` | 31 |
| `getMonitoredEntityIds` | Function | `src/lib/services/user-monitor.server.ts` | 12 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `GET → ToNumber` | cross_community | 6 |
| `GET → RoundAmount` | cross_community | 6 |
| `Load → DocumentDateRange` | cross_community | 5 |
| `Load → ToNumber` | cross_community | 5 |
| `Load → GetCompetitionDatabase` | cross_community | 5 |
| `Load → GetGoogleReviewsDatabase` | cross_community | 5 |
| `Load → GetDateRange` | cross_community | 5 |
| `Load → GetCompetitionDatabase` | cross_community | 5 |
| `Load → GetGoogleReviewsDatabase` | intra_community | 5 |
| `GET → DocumentDateRange` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Server | 8 calls |
| Competition | 7 calls |
| Auth | 4 calls |
| Google-reviews | 3 calls |
| Aggregator-invoices | 3 calls |
| Image-generator | 2 calls |

## How to Explore

1. `gitnexus_context({name: "createOffer"})` — see callers and callees
2. `gitnexus_query({query: "services"})` — find related execution flows
3. Read key files listed above for implementation details
