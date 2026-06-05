---
name: image-generator
description: "Skill for the Image-generator area of marketing-offers-tool. 76 symbols across 23 files."
---

# Image-generator

76 symbols | 23 files | Cohesion: 81%

## When to Use

- Working with code in `src/`
- Understanding how listBrandAssets, attachBrandAssetAsReference, fetchBrandGuidelines work
- Modifying image-generator-related functionality

## Key Files

| File                                                          | Symbols                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/lib/services/image-generator/image-generator.server.ts`  | toUtcDayKey, bucketUsageByDay, getGeneratedImageUsageByDayForUser, parseUsageDateRange, buildUsageWhere (+13) |
| `src/lib/services/image-generator/image-generator-client.ts`  | listBrandAssets, attachBrandAssetAsReference, fetchBrandGuidelines, jsonOrThrow, uploadReferences (+12)       |
| `src/lib/services/image-generator/composer-library.server.ts` | toTemplateDTO, assertAssignedBrands, listTemplatesForUser, createTemplate, updateTemplate (+4)                |
| `src/lib/services/image-generator/orchestrate.server.ts`      | withRetry, isImageQuality, isImageBackground, isInputFidelity, generateOneRow (+1)                            |
| `src/lib/services/image-generator/structured-prompt.ts`       | cleanList, serializeStructuredPrompt, set, mergeSuggestionIntoState                                           |
| `src/lib/services/image-generator/generate.server.ts`         | GenerateValidationError, buildFinalPrompt, createPendingGenerations                                           |
| `src/lib/services/image-providers/types.ts`                   | generateImage, generateImage                                                                                  |
| `src/routes/api/images/templates/+server.ts`                  | GET, POST                                                                                                     |
| `src/lib/server/auth-guards.ts`                               | hasSuperUserRole                                                                                              |
| `src/routes/admin/image-generator-usage/+page.server.ts`      | load                                                                                                          |

## Entry Points

Start here when exploring this area:

- **`listBrandAssets`** (Function) — `src/lib/services/image-generator/image-generator-client.ts:71`
- **`attachBrandAssetAsReference`** (Function) — `src/lib/services/image-generator/image-generator-client.ts:85`
- **`fetchBrandGuidelines`** (Function) — `src/lib/services/image-generator/image-generator-client.ts:96`
- **`uploadReferences`** (Function) — `src/lib/services/image-generator/image-generator-client.ts:112`
- **`enhancePrompt`** (Function) — `src/lib/services/image-generator/image-generator-client.ts:126`

## Key Symbols

| Symbol                               | Type     | File                                                         | Line |
| ------------------------------------ | -------- | ------------------------------------------------------------ | ---- |
| `GenerateValidationError`            | Class    | `src/lib/services/image-generator/generate.server.ts`        | 77   |
| `listBrandAssets`                    | Function | `src/lib/services/image-generator/image-generator-client.ts` | 71   |
| `attachBrandAssetAsReference`        | Function | `src/lib/services/image-generator/image-generator-client.ts` | 85   |
| `fetchBrandGuidelines`               | Function | `src/lib/services/image-generator/image-generator-client.ts` | 96   |
| `uploadReferences`                   | Function | `src/lib/services/image-generator/image-generator-client.ts` | 112  |
| `enhancePrompt`                      | Function | `src/lib/services/image-generator/image-generator-client.ts` | 126  |
| `suggestStructuredPrompt`            | Function | `src/lib/services/image-generator/image-generator-client.ts` | 148  |
| `submitGeneration`                   | Function | `src/lib/services/image-generator/image-generator-client.ts` | 160  |
| `fetchImagesSince`                   | Function | `src/lib/services/image-generator/image-generator-client.ts` | 171  |
| `createPreset`                       | Function | `src/lib/services/image-generator/image-generator-client.ts` | 181  |
| `updatePreset`                       | Function | `src/lib/services/image-generator/image-generator-client.ts` | 193  |
| `deletePreset`                       | Function | `src/lib/services/image-generator/image-generator-client.ts` | 206  |
| `refreshPresets`                     | Function | `src/lib/services/image-generator/image-generator-client.ts` | 211  |
| `createTemplate`                     | Function | `src/lib/services/image-generator/image-generator-client.ts` | 217  |
| `updateTemplate`                     | Function | `src/lib/services/image-generator/image-generator-client.ts` | 229  |
| `deleteTemplate`                     | Function | `src/lib/services/image-generator/image-generator-client.ts` | 242  |
| `refreshTemplates`                   | Function | `src/lib/services/image-generator/image-generator-client.ts` | 247  |
| `hasSuperUserRole`                   | Function | `src/lib/server/auth-guards.ts`                              | 82   |
| `load`                               | Function | `src/routes/admin/image-generator-usage/+page.server.ts`     | 7    |
| `getGeneratedImageUsageByDayForUser` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 308  |

## Execution Flows

| Flow                       | Type            | Steps |
| -------------------------- | --------------- | ----- |
| `POST → LoadEnvFileValues` | cross_community | 7     |
| `GET → AssertSafeKey`      | cross_community | 6     |
| `GET → LoadEnvFileValues`  | cross_community | 6     |
| `POST → AssertSafeKey`     | cross_community | 6     |
| `POST → From`              | cross_community | 6     |
| `Load → AssertSafeKey`     | cross_community | 6     |
| `Load → LoadEnvFileValues` | cross_community | 6     |
| `GET → AssertSafeKey`      | cross_community | 6     |
| `GET → LoadEnvFileValues`  | cross_community | 6     |
| `GET → From`               | cross_community | 5     |

## Connected Areas

| Area            | Connections |
| --------------- | ----------- |
| Server          | 20 calls    |
| Image-providers | 5 calls     |
| Services        | 5 calls     |

## How to Explore

1. `gitnexus_context({name: "listBrandAssets"})` — see callers and callees
2. `gitnexus_query({query: "image-generator"})` — find related execution flows
3. Read key files listed above for implementation details
