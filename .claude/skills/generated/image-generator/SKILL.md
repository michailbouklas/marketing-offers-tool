---
name: image-generator
description: "Skill for the Image-generator area of marketing-offers-tool. 30 symbols across 7 files."
---

# Image-generator

30 symbols | 7 files | Cohesion: 90%

## When to Use

- Working with code in `src/`
- Understanding how parseUsageDateRange, getGeneratedImageUsageByDayAllUsers, getGeneratedImageUsageByModelByDay work
- Modifying image-generator-related functionality

## Key Files

| File                                                             | Symbols                                                                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/lib/services/image-generator/image-generator.server.ts`     | toUtcDayKey, bucketUsageByDay, parseUsageDateRange, buildUsageWhere, getGeneratedImageUsageByDayAllUsers (+12) |
| `src/lib/services/image-generator/image-generator-client.ts`     | listBrandAssets, attachBrandAssetAsReference, fetchBrandGuidelines, jsonOrThrow, uploadReferences (+3)         |
| `src/routes/admin/image-generator-usage/+page.server.ts`         | load                                                                                                           |
| `src/routes/api/admin/image-generator/usage/+server.ts`          | GET                                                                                                            |
| `src/routes/api/admin/image-generator/usage-by-model/+server.ts` | GET                                                                                                            |
| `src/routes/image-generator/me/+page.server.ts`                  | load                                                                                                           |
| `src/routes/api/images/+server.ts`                               | GET                                                                                                            |

## Entry Points

Start here when exploring this area:

- **`parseUsageDateRange`** (Function) — `src/lib/services/image-generator/image-generator.server.ts:319`
- **`getGeneratedImageUsageByDayAllUsers`** (Function) — `src/lib/services/image-generator/image-generator.server.ts:365`
- **`getGeneratedImageUsageByModelByDay`** (Function) — `src/lib/services/image-generator/image-generator.server.ts:402`
- **`getAdminImageUsageOverview`** (Function) — `src/lib/services/image-generator/image-generator.server.ts:494`
- **`load`** (Function) — `src/routes/admin/image-generator-usage/+page.server.ts:7`

## Key Symbols

| Symbol                                   | Type     | File                                                             | Line |
| ---------------------------------------- | -------- | ---------------------------------------------------------------- | ---- |
| `parseUsageDateRange`                    | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 319  |
| `getGeneratedImageUsageByDayAllUsers`    | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 365  |
| `getGeneratedImageUsageByModelByDay`     | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 402  |
| `getAdminImageUsageOverview`             | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 494  |
| `load`                                   | Function | `src/routes/admin/image-generator-usage/+page.server.ts`         | 7    |
| `GET`                                    | Function | `src/routes/api/admin/image-generator/usage/+server.ts`          | 8    |
| `GET`                                    | Function | `src/routes/api/admin/image-generator/usage-by-model/+server.ts` | 8    |
| `listGeneratedImagesHistoryForUser`      | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 201  |
| `listGeneratedImagePromptGroupsForUser`  | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 228  |
| `listGeneratedImageFilterOptionsForUser` | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 575  |
| `load`                                   | Function | `src/routes/image-generator/me/+page.server.ts`                  | 23   |
| `listBrandAssets`                        | Function | `src/lib/services/image-generator/image-generator-client.ts`     | 50   |
| `attachBrandAssetAsReference`            | Function | `src/lib/services/image-generator/image-generator-client.ts`     | 60   |
| `fetchBrandGuidelines`                   | Function | `src/lib/services/image-generator/image-generator-client.ts`     | 71   |
| `uploadReferences`                       | Function | `src/lib/services/image-generator/image-generator-client.ts`     | 87   |
| `enhancePrompt`                          | Function | `src/lib/services/image-generator/image-generator-client.ts`     | 101  |
| `submitGeneration`                       | Function | `src/lib/services/image-generator/image-generator-client.ts`     | 123  |
| `fetchImagesSince`                       | Function | `src/lib/services/image-generator/image-generator-client.ts`     | 134  |
| `listGeneratedImagesForUser`             | Function | `src/lib/services/image-generator/image-generator.server.ts`     | 109  |
| `GET`                                    | Function | `src/routes/api/images/+server.ts`                               | 5    |

## Execution Flows

| Flow                              | Type            | Steps |
| --------------------------------- | --------------- | ----- |
| `Load → GetDateRange`             | intra_community | 4     |
| `GET → ToUtcDayKey`               | intra_community | 4     |
| `GET → ToUtcDayKey`               | cross_community | 4     |
| `Load → ClampPageSize`            | intra_community | 3     |
| `Load → RequireAuthenticatedUser` | cross_community | 3     |
| `Load → GetAuthenticatedUserRole` | cross_community | 3     |
| `Load → IsAdminRole`              | cross_community | 3     |
| `Load → BuildUsageWhere`          | intra_community | 3     |
| `GET → RequireAuthenticatedUser`  | cross_community | 3     |
| `GET → GetAuthenticatedUserRole`  | cross_community | 3     |

## Connected Areas

| Area              | Connections |
| ----------------- | ----------- |
| Server            | 3 calls     |
| Aggregator-offers | 1 calls     |
| Services          | 1 calls     |
| [id]              | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "parseUsageDateRange"})` — see callers and callees
2. `gitnexus_query({query: "image-generator"})` — find related execution flows
3. Read key files listed above for implementation details
