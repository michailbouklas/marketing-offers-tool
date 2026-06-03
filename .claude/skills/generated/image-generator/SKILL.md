---
name: image-generator
description: "Skill for the Image-generator area of marketing-offers-tool. 35 symbols across 10 files."
---

# Image-generator

35 symbols | 10 files | Cohesion: 84%

## When to Use

- Working with code in `src/`
- Understanding how load, parseUsageDateRange, getGeneratedImageUsageByDayAllUsers work
- Modifying image-generator-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/services/image-generator/image-generator.server.ts` | toUtcDayKey, bucketUsageByDay, parseUsageDateRange, buildUsageWhere, getGeneratedImageUsageByDayAllUsers (+12) |
| `src/lib/services/image-generator/image-generator-client.ts` | listBrandAssets, attachBrandAssetAsReference, fetchBrandGuidelines, jsonOrThrow, uploadReferences (+3) |
| `src/lib/services/image-generator/generate.server.ts` | GenerateValidationError, buildFinalPrompt, createPendingGenerations |
| `src/routes/admin/image-generator-usage/+page.server.ts` | load |
| `src/routes/api/admin/image-generator/usage-by-model/+server.ts` | GET |
| `src/routes/api/admin/image-generator/usage/+server.ts` | GET |
| `src/routes/image-generator/me/+page.server.ts` | load |
| `src/lib/services/image-generator/orchestrate.server.ts` | kickoffPendingGenerations |
| `src/routes/api/images/generate/+server.ts` | POST |
| `src/routes/api/images/+server.ts` | GET |

## Entry Points

Start here when exploring this area:

- **`load`** (Function) — `src/routes/admin/image-generator-usage/+page.server.ts:7`
- **`parseUsageDateRange`** (Function) — `src/lib/services/image-generator/image-generator.server.ts:327`
- **`getGeneratedImageUsageByDayAllUsers`** (Function) — `src/lib/services/image-generator/image-generator.server.ts:373`
- **`getGeneratedImageUsageByModelByDay`** (Function) — `src/lib/services/image-generator/image-generator.server.ts:410`
- **`getAdminImageUsageOverview`** (Function) — `src/lib/services/image-generator/image-generator.server.ts:502`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `GenerateValidationError` | Class | `src/lib/services/image-generator/generate.server.ts` | 77 |
| `load` | Function | `src/routes/admin/image-generator-usage/+page.server.ts` | 7 |
| `parseUsageDateRange` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 327 |
| `getGeneratedImageUsageByDayAllUsers` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 373 |
| `getGeneratedImageUsageByModelByDay` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 410 |
| `getAdminImageUsageOverview` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 502 |
| `GET` | Function | `src/routes/api/admin/image-generator/usage-by-model/+server.ts` | 8 |
| `GET` | Function | `src/routes/api/admin/image-generator/usage/+server.ts` | 8 |
| `load` | Function | `src/routes/image-generator/me/+page.server.ts` | 23 |
| `listGeneratedImagesHistoryForUser` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 209 |
| `listGeneratedImagePromptGroupsForUser` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 236 |
| `listGeneratedImageFilterOptionsForUser` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 583 |
| `listBrandAssets` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 53 |
| `attachBrandAssetAsReference` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 63 |
| `fetchBrandGuidelines` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 74 |
| `uploadReferences` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 90 |
| `enhancePrompt` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 104 |
| `submitGeneration` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 126 |
| `fetchImagesSince` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 137 |
| `kickoffPendingGenerations` | Function | `src/lib/services/image-generator/orchestrate.server.ts` | 162 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `POST → LoadEnvFileValues` | cross_community | 7 |
| `POST → AssertSafeKey` | cross_community | 6 |
| `POST → From` | cross_community | 6 |
| `POST → ToModelList` | cross_community | 5 |
| `POST → StringArray` | cross_community | 5 |
| `Load → GetDateRange` | intra_community | 4 |
| `POST → ParseSize` | cross_community | 4 |
| `POST → GreatestCommonDivisor` | cross_community | 4 |
| `POST → Get` | cross_community | 4 |
| `POST → GenerateImage` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Server | 5 calls |
| Services | 4 calls |
| Image-providers | 2 calls |
| Aggregator-offers | 1 calls |
| Brand-context | 1 calls |

## How to Explore

1. `gitnexus_context({name: "load"})` — see callers and callees
2. `gitnexus_query({query: "image-generator"})` — find related execution flows
3. Read key files listed above for implementation details
