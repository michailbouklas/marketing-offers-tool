---
name: image-generator
description: "Skill for the Image-generator area of marketing-offers-tool. 20 symbols across 4 files."
---

# Image-generator

20 symbols | 4 files | Cohesion: 93%

## When to Use

- Working with code in `src/`
- Understanding how load, listGeneratedImagesHistoryForUser, listGeneratedImagePromptGroupsForUser work
- Modifying image-generator-related functionality

## Key Files

| File                                                         | Symbols                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `src/lib/services/image-generator/image-generator.server.ts` | clampPage, clampPageSize, getDateRange, buildHistoryWhere, listGeneratedImagesHistoryForUser (+5)      |
| `src/lib/services/image-generator/image-generator-client.ts` | listBrandAssets, attachBrandAssetAsReference, fetchBrandGuidelines, jsonOrThrow, uploadReferences (+3) |
| `src/routes/image-generator/me/+page.server.ts`              | load                                                                                                   |
| `src/routes/api/images/+server.ts`                           | GET                                                                                                    |

## Entry Points

Start here when exploring this area:

- **`load`** (Function) — `src/routes/image-generator/me/+page.server.ts:23`
- **`listGeneratedImagesHistoryForUser`** (Function) — `src/lib/services/image-generator/image-generator.server.ts:194`
- **`listGeneratedImagePromptGroupsForUser`** (Function) — `src/lib/services/image-generator/image-generator.server.ts:221`
- **`listGeneratedImageFilterOptionsForUser`** (Function) — `src/lib/services/image-generator/image-generator.server.ts:242`
- **`listBrandAssets`** (Function) — `src/lib/services/image-generator/image-generator-client.ts:44`

## Key Symbols

| Symbol                                   | Type     | File                                                         | Line |
| ---------------------------------------- | -------- | ------------------------------------------------------------ | ---- |
| `load`                                   | Function | `src/routes/image-generator/me/+page.server.ts`              | 23   |
| `listGeneratedImagesHistoryForUser`      | Function | `src/lib/services/image-generator/image-generator.server.ts` | 194  |
| `listGeneratedImagePromptGroupsForUser`  | Function | `src/lib/services/image-generator/image-generator.server.ts` | 221  |
| `listGeneratedImageFilterOptionsForUser` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 242  |
| `listBrandAssets`                        | Function | `src/lib/services/image-generator/image-generator-client.ts` | 44   |
| `attachBrandAssetAsReference`            | Function | `src/lib/services/image-generator/image-generator-client.ts` | 54   |
| `fetchBrandGuidelines`                   | Function | `src/lib/services/image-generator/image-generator-client.ts` | 65   |
| `uploadReferences`                       | Function | `src/lib/services/image-generator/image-generator-client.ts` | 81   |
| `enhancePrompt`                          | Function | `src/lib/services/image-generator/image-generator-client.ts` | 95   |
| `submitGeneration`                       | Function | `src/lib/services/image-generator/image-generator-client.ts` | 108  |
| `fetchImagesSince`                       | Function | `src/lib/services/image-generator/image-generator-client.ts` | 119  |
| `GET`                                    | Function | `src/routes/api/images/+server.ts`                           | 5    |
| `listGeneratedImagesForUser`             | Function | `src/lib/services/image-generator/image-generator.server.ts` | 102  |
| `clampPage`                              | Function | `src/lib/services/image-generator/image-generator.server.ts` | 132  |
| `clampPageSize`                          | Function | `src/lib/services/image-generator/image-generator.server.ts` | 140  |
| `getDateRange`                           | Function | `src/lib/services/image-generator/image-generator.server.ts` | 148  |
| `buildHistoryWhere`                      | Function | `src/lib/services/image-generator/image-generator.server.ts` | 164  |
| `jsonOrThrow`                            | Function | `src/lib/services/image-generator/image-generator-client.ts` | 73   |
| `clampLimit`                             | Function | `src/lib/services/image-generator/image-generator.server.ts` | 87   |
| `parseSince`                             | Function | `src/lib/services/image-generator/image-generator.server.ts` | 94   |

## Execution Flows

| Flow                   | Type            | Steps |
| ---------------------- | --------------- | ----- |
| `Load → GetDateRange`  | intra_community | 4     |
| `Load → ClampPageSize` | intra_community | 3     |
| `GET → ClampLimit`     | intra_community | 3     |
| `GET → ParseSince`     | intra_community | 3     |

## Connected Areas

| Area     | Connections |
| -------- | ----------- |
| Services | 2 calls     |
| [id]     | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "load"})` — see callers and callees
2. `gitnexus_query({query: "image-generator"})` — find related execution flows
3. Read key files listed above for implementation details
