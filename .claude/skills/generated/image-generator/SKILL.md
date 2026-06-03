---
name: image-generator
description: "Skill for the Image-generator area of marketing-offers-tool. 40 symbols across 11 files."
---

# Image-generator

40 symbols | 11 files | Cohesion: 85%

## When to Use

- Working with code in `src/`
- Understanding how resizeToRequested, generateOneRow, kickoffPendingGenerations work
- Modifying image-generator-related functionality

## Key Files

| File                                                             | Symbols                                                                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/lib/services/image-generator/image-generator.server.ts`     | toUtcDayKey, bucketUsageByDay, parseUsageDateRange, buildUsageWhere, getGeneratedImageUsageByDayAllUsers (+12) |
| `src/lib/services/image-generator/image-generator-client.ts`     | listBrandAssets, attachBrandAssetAsReference, fetchBrandGuidelines, jsonOrThrow, uploadReferences (+3)         |
| `src/lib/services/image-generator/orchestrate.server.ts`         | withRetry, isImageQuality, isImageBackground, isInputFidelity, generateOneRow (+1)                             |
| `src/lib/services/image-providers/types.ts`                      | generateImage, generateImage                                                                                   |
| `src/lib/server/image-size.ts`                                   | resizeToRequested                                                                                              |
| `src/routes/api/images/generate/+server.ts`                      | POST                                                                                                           |
| `src/routes/admin/image-generator-usage/+page.server.ts`         | load                                                                                                           |
| `src/routes/api/admin/image-generator/usage-by-model/+server.ts` | GET                                                                                                            |
| `src/routes/api/admin/image-generator/usage/+server.ts`          | GET                                                                                                            |
| `src/routes/image-generator/me/+page.server.ts`                  | load                                                                                                           |

## Entry Points

Start here when exploring this area:

- **`resizeToRequested`** (Function) — `src/lib/server/image-size.ts:89`
- **`generateOneRow`** (Function) — `src/lib/services/image-generator/orchestrate.server.ts:44`
- **`kickoffPendingGenerations`** (Function) — `src/lib/services/image-generator/orchestrate.server.ts:141`
- **`POST`** (Function) — `src/routes/api/images/generate/+server.ts:10`
- **`load`** (Function) — `src/routes/admin/image-generator-usage/+page.server.ts:7`

## Key Symbols

| Symbol                                   | Type     | File                                                             | Line |
| ---------------------------------------- | -------- | ---------------------------------------------------------------- | ---- |
| `resizeToRequested`                      | Function | `src/lib/server/image-size.ts`                                   | 89   |
| `generateOneRow`                         | Function | `src/lib/services/image-generator/orchestrate.server.ts`         | 44   |
| `kickoffPendingGenerations`              | Function | `src/lib/services/image-generator/orchestrate.server.ts`         | 141  |
| `POST`                                   | Function | `src/routes/api/images/generate/+server.ts`                      | 10   |
| `load`                                   | Function | `src/routes/admin/image-generator-usage/+page.server.ts`         | 7    |
| `parseUsageDateRange`                    | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 327  |
| `getGeneratedImageUsageByDayAllUsers`    | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 373  |
| `getGeneratedImageUsageByModelByDay`     | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 410  |
| `getAdminImageUsageOverview`             | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 502  |
| `GET`                                    | Function | `src/routes/api/admin/image-generator/usage-by-model/+server.ts` | 8    |
| `GET`                                    | Function | `src/routes/api/admin/image-generator/usage/+server.ts`          | 8    |
| `load`                                   | Function | `src/routes/image-generator/me/+page.server.ts`                  | 23   |
| `listGeneratedImagesHistoryForUser`      | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 209  |
| `listGeneratedImagePromptGroupsForUser`  | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 236  |
| `listGeneratedImageFilterOptionsForUser` | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 583  |
| `listBrandAssets`                        | Function | `src/lib/services/image-generator/image-generator-client.ts`     | 53   |
| `attachBrandAssetAsReference`            | Function | `src/lib/services/image-generator/image-generator-client.ts`     | 63   |
| `fetchBrandGuidelines`                   | Function | `src/lib/services/image-generator/image-generator-client.ts`     | 74   |
| `uploadReferences`                       | Function | `src/lib/services/image-generator/image-generator-client.ts`     | 90   |
| `enhancePrompt`                          | Function | `src/lib/services/image-generator/image-generator-client.ts`     | 104  |

## Execution Flows

| Flow                                              | Type            | Steps |
| ------------------------------------------------- | --------------- | ----- |
| `POST → ToModelList`                              | cross_community | 5     |
| `POST → StringArray`                              | cross_community | 5     |
| `POST → SafeParseError`                           | cross_community | 5     |
| `POST → OpenAIProviderError`                      | cross_community | 5     |
| `POST → FetchFn`                                  | cross_community | 5     |
| `POST → ContentTypeFromPath`                      | cross_community | 5     |
| `POST → SafeParseError`                           | cross_community | 5     |
| `KickoffPendingGenerations → FetchFn`             | cross_community | 5     |
| `KickoffPendingGenerations → ContentTypeFromPath` | cross_community | 5     |
| `Load → GetDateRange`                             | intra_community | 4     |

## Connected Areas

| Area              | Connections |
| ----------------- | ----------- |
| Services          | 4 calls     |
| Image-providers   | 3 calls     |
| Server            | 3 calls     |
| [id]              | 2 calls     |
| Aggregator-offers | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "resizeToRequested"})` — see callers and callees
2. `gitnexus_query({query: "image-generator"})` — find related execution flows
3. Read key files listed above for implementation details
