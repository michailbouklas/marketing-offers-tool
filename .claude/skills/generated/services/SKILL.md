---
name: services
description: "Skill for the Services area of marketing-offers-tool. 171 symbols across 47 files."
---

# Services

171 symbols | 47 files | Cohesion: 75%

## When to Use

- Working with code in `src/`
- Understanding how createOffer, updateOffer, load work
- Modifying services-related functionality

## Key Files

| File                                                        | Symbols                                                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/services/offers-data-quality.ts`                   | getDefaultGapPricingFormData, applyGapPricingLookupDefaults, mapGapLoadResponseToGapPricingFormData, formatInputNumber, parseMissingFields (+12) |
| `src/lib/services/offers-data-quality-postgres.server.ts`   | listChannels, listPricingCategories, listPricingSubcategoriesByCategoryId, getGapRecordById, getPendingStagingRecordByItemCode (+11)             |
| `src/lib/services/admin-dim-offers.server.ts`               | parseCount, getSortExpression, buildFilterClauses, buildWhereClause, buildBaseQueryParams (+9)                                                   |
| `src/lib/services/offers-data-quality.server.ts`            | mapPendingSubmission, getGapFormData, getPendingGapSubmission, getPendingGapSubmissionQueue, approveGapSubmission (+8)                           |
| `src/lib/services/offers-data-quality-clickhouse.server.ts` | parseNullableNumber, getCurrentDimOfferValues, formatNullableFixedNumber, getDimOfferAuditSnapshot, insertDimOffer (+8)                          |
| `src/lib/services/offers-filter-form.ts`                    | mapOffersFilterFormToFilters, applyLifecyclePreset, toStartOfDay, toEndOfDay, toLocalStartOfDay (+3)                                             |
| `src/lib/services/users.server.ts`                          | listUsers, normalizeRoles, countUsers, createUser, updateUser (+2)                                                                               |
| `src/lib/services/dim-offers-audit.server.ts`               | listChangedFields, createDimOffersAuditRecord, parseNullableNumber, isSnapshotRecord, mapSnapshotToAdminRow (+1)                                 |
| `src/lib/services/offer-editor-form.ts`                     | mapOfferEditorFormToCreateInput, getDefaultOfferEditorFormData, mapOfferToEditorFormDefaults, toDateTimeLocalValue, pad                          |
| `src/lib/services/brand-entities.server.ts`                 | getBrandRefsByEntityIds, annotateWithAssignment, searchCompetitionRestaurantCandidates, searchGoogleBusinessCandidates, resolveCompetitionNames  |

## Entry Points

Start here when exploring this area:

- **`createOffer`** (Function) — `src/routes/aggregator-offers/+page.server.ts:68`
- **`updateOffer`** (Function) — `src/routes/aggregator-offers/+page.server.ts:92`
- **`load`** (Function) — `src/routes/aggregator-kpis/+page.server.ts:4`
- **`requirePermission`** (Function) — `src/lib/server/auth-guards.ts:137`
- **`listUrlsToScrape`** (Function) — `src/lib/services/urls-to-scrape.server.ts:9`

## Key Symbols

| Symbol                            | Type     | File                                                   | Line |
| --------------------------------- | -------- | ------------------------------------------------------ | ---- |
| `createOffer`                     | Function | `src/routes/aggregator-offers/+page.server.ts`         | 68   |
| `updateOffer`                     | Function | `src/routes/aggregator-offers/+page.server.ts`         | 92   |
| `load`                            | Function | `src/routes/aggregator-kpis/+page.server.ts`           | 4    |
| `requirePermission`               | Function | `src/lib/server/auth-guards.ts`                        | 137  |
| `listUrlsToScrape`                | Function | `src/lib/services/urls-to-scrape.server.ts`            | 9    |
| `createUrlToScrape`               | Function | `src/lib/services/urls-to-scrape.server.ts`            | 24   |
| `createUrlsToScrape`              | Function | `src/lib/services/urls-to-scrape.server.ts`            | 38   |
| `getDefaultUrlToScrapeFormData`   | Function | `src/lib/services/urls-to-scrape-form.ts`              | 55   |
| `mapOfferEditorFormToCreateInput` | Function | `src/lib/services/offer-editor-form.ts`                | 83   |
| `toggleTrack`                     | Function | `src/routes/competition/restaurants/+page.server.ts`   | 124  |
| `addMonitor`                      | Function | `src/routes/competition/restaurants/+page.server.ts`   | 153  |
| `removeMonitor`                   | Function | `src/routes/competition/restaurants/+page.server.ts`   | 174  |
| `addMonitor`                      | Function | `src/routes/google-reviews/businesses/+page.server.ts` | 113  |
| `removeMonitor`                   | Function | `src/routes/google-reviews/businesses/+page.server.ts` | 136  |
| `createUser`                      | Function | `src/routes/admin/users/+page.server.ts`               | 42   |
| `updateUser`                      | Function | `src/routes/admin/users/+page.server.ts`               | 74   |
| `load`                            | Function | `src/routes/admin/urls-to-scrape/+page.server.ts`      | 18   |
| `createUrl`                       | Function | `src/routes/admin/urls-to-scrape/+page.server.ts`      | 37   |
| `bulkCreateUrls`                  | Function | `src/routes/admin/urls-to-scrape/+page.server.ts`      | 68   |
| `setRestaurantPref`               | Function | `src/lib/services/competition/preferences.server.ts`   | 31   |

## Execution Flows

| Flow                            | Type            | Steps |
| ------------------------------- | --------------- | ----- |
| `Load → GetCompetitionDatabase` | cross_community | 5     |
| `Load → GetCompetitionDatabase` | cross_community | 5     |
| `POST → ParseNullableNumber`    | cross_community | 5     |
| `Load → ParseRoles`             | cross_community | 5     |
| `GET → GetCompetitionDatabase`  | cross_community | 5     |
| `Load → GetSortExpression`      | cross_community | 5     |
| `Load → IsSnapshotRecord`       | intra_community | 5     |
| `Load → ParseNullableNumber`    | intra_community | 5     |
| `POST → ParseNullableNumber`    | cross_community | 5     |
| `Load → FormatDate`             | cross_community | 4     |

## Connected Areas

| Area            | Connections |
| --------------- | ----------- |
| Server          | 6 calls     |
| Export          | 2 calls     |
| Competition     | 2 calls     |
| Image-generator | 1 calls     |
| Aggregator-kpis | 1 calls     |
| Guidelines      | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "createOffer"})` — see callers and callees
2. `gitnexus_query({query: "services"})` — find related execution flows
3. Read key files listed above for implementation details
