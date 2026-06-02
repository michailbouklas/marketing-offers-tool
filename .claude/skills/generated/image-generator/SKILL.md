---
name: image-generator
description: "Skill for the Image-generator area of marketing-offers-tool. 40 symbols across 12 files."
---

# Image-generator

40 symbols | 12 files | Cohesion: 86%

## When to Use

- Working with code in `src/`
- Understanding how load, parseRequestedSize, mapToNearestSupportedSize work
- Modifying image-generator-related functionality

## Key Files

| File                                                             | Symbols                                                                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/lib/services/image-generator/image-generator.server.ts`     | toUtcDayKey, bucketUsageByDay, parseUsageDateRange, buildUsageWhere, getGeneratedImageUsageByDayAllUsers (+12) |
| `src/lib/services/image-generator/image-generator-client.ts`     | listBrandAssets, attachBrandAssetAsReference, fetchBrandGuidelines, jsonOrThrow, uploadReferences (+3)         |
| `src/lib/server/image-size.ts`                                   | toPositiveInt, parseRequestedSize, squaredAspectRatioDelta, mapToNearestSupportedSize                          |
| `src/lib/services/image-generator/generate.server.ts`            | GenerateValidationError, buildFinalPrompt, createPendingGenerations                                            |
| `src/routes/image-generator/+page.server.ts`                     | load                                                                                                           |
| `src/lib/services/image-providers/config.server.ts`              | buildImageGeneratorConfig                                                                                      |
| `src/routes/api/images/config/+server.ts`                        | GET                                                                                                            |
| `src/routes/admin/image-generator-usage/+page.server.ts`         | load                                                                                                           |
| `src/routes/api/admin/image-generator/usage/+server.ts`          | GET                                                                                                            |
| `src/routes/api/admin/image-generator/usage-by-model/+server.ts` | GET                                                                                                            |

## Entry Points

Start here when exploring this area:

- **`load`** (Function) — `src/routes/image-generator/+page.server.ts:5`
- **`parseRequestedSize`** (Function) — `src/lib/server/image-size.ts:26`
- **`mapToNearestSupportedSize`** (Function) — `src/lib/server/image-size.ts:61`
- **`buildImageGeneratorConfig`** (Function) — `src/lib/services/image-providers/config.server.ts:7`
- **`buildFinalPrompt`** (Function) — `src/lib/services/image-generator/generate.server.ts:49`

## Key Symbols

| Symbol                                   | Type     | File                                                             | Line |
| ---------------------------------------- | -------- | ---------------------------------------------------------------- | ---- |
| `GenerateValidationError`                | Class    | `src/lib/services/image-generator/generate.server.ts`            | 39   |
| `load`                                   | Function | `src/routes/image-generator/+page.server.ts`                     | 5    |
| `parseRequestedSize`                     | Function | `src/lib/server/image-size.ts`                                   | 26   |
| `mapToNearestSupportedSize`              | Function | `src/lib/server/image-size.ts`                                   | 61   |
| `buildImageGeneratorConfig`              | Function | `src/lib/services/image-providers/config.server.ts`              | 7    |
| `buildFinalPrompt`                       | Function | `src/lib/services/image-generator/generate.server.ts`            | 49   |
| `createPendingGenerations`               | Function | `src/lib/services/image-generator/generate.server.ts`            | 78   |
| `GET`                                    | Function | `src/routes/api/images/config/+server.ts`                        | 5    |
| `load`                                   | Function | `src/routes/admin/image-generator-usage/+page.server.ts`         | 7    |
| `parseUsageDateRange`                    | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 319  |
| `getGeneratedImageUsageByDayAllUsers`    | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 365  |
| `getGeneratedImageUsageByModelByDay`     | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 402  |
| `getAdminImageUsageOverview`             | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 494  |
| `GET`                                    | Function | `src/routes/api/admin/image-generator/usage/+server.ts`          | 8    |
| `GET`                                    | Function | `src/routes/api/admin/image-generator/usage-by-model/+server.ts` | 8    |
| `load`                                   | Function | `src/routes/image-generator/me/+page.server.ts`                  | 23   |
| `listGeneratedImagesHistoryForUser`      | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 201  |
| `listGeneratedImagePromptGroupsForUser`  | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 228  |
| `listGeneratedImageFilterOptionsForUser` | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 575  |
| `listBrandAssets`                        | Function | `src/lib/services/image-generator/image-generator-client.ts`     | 50   |

## Execution Flows

| Flow                                           | Type            | Steps |
| ---------------------------------------------- | --------------- | ----- |
| `Load → LoadEnvFileValues`                     | cross_community | 6     |
| `POST → LoadEnvFileValues`                     | cross_community | 6     |
| `GET → LoadEnvFileValues`                      | cross_community | 6     |
| `CreatePendingGenerations → LoadEnvFileValues` | cross_community | 6     |
| `Load → GetDateRange`                          | intra_community | 4     |
| `Load → ParseRoles`                            | cross_community | 4     |
| `POST → ToPositiveInt`                         | cross_community | 4     |
| `GET → ParseRoles`                             | cross_community | 4     |
| `GET → ToUtcDayKey`                            | intra_community | 4     |
| `GET → ParseRoles`                             | cross_community | 4     |

## Connected Areas

| Area              | Connections |
| ----------------- | ----------- |
| Server            | 8 calls     |
| Aggregator-offers | 2 calls     |
| Services          | 2 calls     |

## How to Explore

1. `gitnexus_context({name: "load"})` — see callers and callees
2. `gitnexus_query({query: "image-generator"})` — find related execution flows
3. Read key files listed above for implementation details
