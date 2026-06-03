---
name: image-generator
description: "Skill for the Image-generator area of marketing-offers-tool. 37 symbols across 11 files."
---

# Image-generator

37 symbols | 11 files | Cohesion: 85%

## When to Use

- Working with code in `src/`
- Understanding how getGeneratedImageUsageByDayForUser, parseUsageDateRange, getGeneratedImageUsageByDayAllUsers work
- Modifying image-generator-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/services/image-generator/image-generator.server.ts` | toUtcDayKey, bucketUsageByDay, getGeneratedImageUsageByDayForUser, parseUsageDateRange, buildUsageWhere (+13) |
| `src/lib/services/image-generator/image-generator-client.ts` | listBrandAssets, attachBrandAssetAsReference, fetchBrandGuidelines, jsonOrThrow, uploadReferences (+3) |
| `src/lib/services/image-generator/generate.server.ts` | GenerateValidationError, buildFinalPrompt, createPendingGenerations |
| `src/routes/admin/image-generator-usage/+page.server.ts` | load |
| `src/routes/api/images/usage/+server.ts` | GET |
| `src/routes/api/admin/image-generator/usage-by-model/+server.ts` | GET |
| `src/routes/api/admin/image-generator/usage/+server.ts` | GET |
| `src/routes/image-generator/me/+page.server.ts` | load |
| `src/lib/services/image-generator/orchestrate.server.ts` | kickoffPendingGenerations |
| `src/routes/api/images/generate/+server.ts` | POST |

## Entry Points

Start here when exploring this area:

- **`getGeneratedImageUsageByDayForUser`** (Function) — `src/lib/services/image-generator/image-generator.server.ts:308`
- **`parseUsageDateRange`** (Function) — `src/lib/services/image-generator/image-generator.server.ts:334`
- **`getGeneratedImageUsageByDayAllUsers`** (Function) — `src/lib/services/image-generator/image-generator.server.ts:380`
- **`getGeneratedImageUsageByModelByDay`** (Function) — `src/lib/services/image-generator/image-generator.server.ts:417`
- **`getAdminImageUsageOverview`** (Function) — `src/lib/services/image-generator/image-generator.server.ts:509`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `GenerateValidationError` | Class | `src/lib/services/image-generator/generate.server.ts` | 77 |
| `getGeneratedImageUsageByDayForUser` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 308 |
| `parseUsageDateRange` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 334 |
| `getGeneratedImageUsageByDayAllUsers` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 380 |
| `getGeneratedImageUsageByModelByDay` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 417 |
| `getAdminImageUsageOverview` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 509 |
| `load` | Function | `src/routes/admin/image-generator-usage/+page.server.ts` | 7 |
| `GET` | Function | `src/routes/api/images/usage/+server.ts` | 5 |
| `GET` | Function | `src/routes/api/admin/image-generator/usage-by-model/+server.ts` | 8 |
| `GET` | Function | `src/routes/api/admin/image-generator/usage/+server.ts` | 8 |
| `listGeneratedImagesHistoryForUser` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 216 |
| `listGeneratedImagePromptGroupsForUser` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 243 |
| `listGeneratedImageFilterOptionsForUser` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 590 |
| `load` | Function | `src/routes/image-generator/me/+page.server.ts` | 23 |
| `listBrandAssets` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 53 |
| `attachBrandAssetAsReference` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 63 |
| `fetchBrandGuidelines` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 74 |
| `uploadReferences` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 90 |
| `enhancePrompt` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 104 |
| `submitGeneration` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 126 |

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
| Server | 9 calls |
| Services | 3 calls |
| Image-providers | 2 calls |

## How to Explore

1. `gitnexus_context({name: "getGeneratedImageUsageByDayForUser"})` — see callers and callees
2. `gitnexus_query({query: "image-generator"})` — find related execution flows
3. Read key files listed above for implementation details
