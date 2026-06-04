---
name: image-generator
description: "Skill for the Image-generator area of marketing-offers-tool. 59 symbols across 16 files."
---

# Image-generator

59 symbols | 16 files | Cohesion: 84%

## When to Use

- Working with code in `src/`
- Understanding how listBrandAssets, attachBrandAssetAsReference, fetchBrandGuidelines work
- Modifying image-generator-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/services/image-generator/image-generator.server.ts` | toUtcDayKey, bucketUsageByDay, getGeneratedImageUsageByDayForUser, parseUsageDateRange, buildUsageWhere (+13) |
| `src/lib/services/image-generator/image-generator-client.ts` | listBrandAssets, attachBrandAssetAsReference, fetchBrandGuidelines, jsonOrThrow, uploadReferences (+11) |
| `src/lib/services/image-generator/composer-library.server.ts` | toTemplateDTO, assertAssignedBrands, listTemplatesForUser, createTemplate, updateTemplate (+4) |
| `src/lib/services/image-generator/generate.server.ts` | GenerateValidationError, buildFinalPrompt, createPendingGenerations |
| `src/routes/api/images/templates/+server.ts` | GET, POST |
| `src/routes/admin/image-generator-usage/+page.server.ts` | load |
| `src/routes/api/images/usage/+server.ts` | GET |
| `src/routes/api/admin/image-generator/usage-by-model/+server.ts` | GET |
| `src/routes/api/admin/image-generator/usage/+server.ts` | GET |
| `src/routes/image-generator/me/+page.server.ts` | load |

## Entry Points

Start here when exploring this area:

- **`listBrandAssets`** (Function) — `src/lib/services/image-generator/image-generator-client.ts:70`
- **`attachBrandAssetAsReference`** (Function) — `src/lib/services/image-generator/image-generator-client.ts:84`
- **`fetchBrandGuidelines`** (Function) — `src/lib/services/image-generator/image-generator-client.ts:95`
- **`uploadReferences`** (Function) — `src/lib/services/image-generator/image-generator-client.ts:111`
- **`enhancePrompt`** (Function) — `src/lib/services/image-generator/image-generator-client.ts:125`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `GenerateValidationError` | Class | `src/lib/services/image-generator/generate.server.ts` | 77 |
| `listBrandAssets` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 70 |
| `attachBrandAssetAsReference` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 84 |
| `fetchBrandGuidelines` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 95 |
| `uploadReferences` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 111 |
| `enhancePrompt` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 125 |
| `submitGeneration` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 147 |
| `fetchImagesSince` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 158 |
| `createPreset` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 168 |
| `updatePreset` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 180 |
| `deletePreset` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 193 |
| `refreshPresets` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 198 |
| `createTemplate` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 204 |
| `updateTemplate` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 216 |
| `deleteTemplate` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 229 |
| `refreshTemplates` | Function | `src/lib/services/image-generator/image-generator-client.ts` | 234 |
| `load` | Function | `src/routes/admin/image-generator-usage/+page.server.ts` | 7 |
| `getGeneratedImageUsageByDayForUser` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 308 |
| `parseUsageDateRange` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 334 |
| `getGeneratedImageUsageByDayAllUsers` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 380 |

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
| [id] | 8 calls |
| Services | 4 calls |
| Server | 3 calls |
| Image-providers | 2 calls |
| Aggregator-offers | 1 calls |
| Brand-context | 1 calls |

## How to Explore

1. `gitnexus_context({name: "listBrandAssets"})` — see callers and callees
2. `gitnexus_query({query: "image-generator"})` — find related execution flows
3. Read key files listed above for implementation details
