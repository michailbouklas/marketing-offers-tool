---
name: image-providers
description: "Skill for the Image-providers area of marketing-offers-tool. 39 symbols across 11 files."
---

# Image-providers

39 symbols | 11 files | Cohesion: 87%

## When to Use

- Working with code in `src/`
- Understanding how parseSize, ratioOf, sizeLabel work
- Modifying image-providers-related functionality

## Key Files

| File                                                            | Symbols                                                                                                   |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/lib/services/image-providers/openai.server.ts`             | OpenAIProviderError, generateImage, postGenerations, postEdits, safeParseError (+3)                       |
| `src/lib/services/image-providers/model-sizes.ts`               | greatestCommonDivisor, parseSize, ratioOf, sizeLabel, concreteSizes (+2)                                  |
| `src/lib/services/image-providers/enhance.server.ts`            | PromptEnhancerError, enhance, enhanceWithClarifications, callChatCompletion, parseEnhanceContent (+2)     |
| `src/lib/services/image-providers/imagerouter.server.ts`        | ImageRouterImageProvider, ImageRouterProviderError, generateImage, safeParseError, resolveImageBytes (+1) |
| `src/lib/services/image-providers/imagerouter-models.server.ts` | stringArray, toModelList, fetchImageRouterModelCaps                                                       |
| `src/lib/services/image-providers/types.ts`                     | ImageProvider, FakeProvider                                                                               |
| `src/lib/services/image-providers/model-display.ts`             | splitModelId, modelLabel                                                                                  |
| `src/routes/image-generator/+page.server.ts`                    | load                                                                                                      |
| `src/lib/services/image-providers/config.server.ts`             | buildImageGeneratorConfig                                                                                 |
| `src/routes/api/images/config/+server.ts`                       | GET                                                                                                       |

## Entry Points

Start here when exploring this area:

- **`parseSize`** (Function) — `src/lib/services/image-providers/model-sizes.ts:17`
- **`ratioOf`** (Function) — `src/lib/services/image-providers/model-sizes.ts:36`
- **`sizeLabel`** (Function) — `src/lib/services/image-providers/model-sizes.ts:46`
- **`intersectModelSizes`** (Function) — `src/lib/services/image-providers/model-sizes.ts:77`
- **`withConcrete`** (Function) — `src/lib/services/image-providers/model-sizes.ts:82`

## Key Symbols

| Symbol                      | Type     | File                                                            | Line |
| --------------------------- | -------- | --------------------------------------------------------------- | ---- |
| `OpenAIProviderError`       | Class    | `src/lib/services/image-providers/openai.server.ts`             | 14   |
| `PromptEnhancerError`       | Class    | `src/lib/services/image-providers/enhance.server.ts`            | 95   |
| `FakeProvider`              | Class    | `src/lib/services/image-providers/types.ts`                     | 38   |
| `OpenAIImageProvider`       | Class    | `src/lib/services/image-providers/openai.server.ts`             | 41   |
| `ImageRouterImageProvider`  | Class    | `src/lib/services/image-providers/imagerouter.server.ts`        | 33   |
| `ImageRouterProviderError`  | Class    | `src/lib/services/image-providers/imagerouter.server.ts`        | 6    |
| `parseSize`                 | Function | `src/lib/services/image-providers/model-sizes.ts`               | 17   |
| `ratioOf`                   | Function | `src/lib/services/image-providers/model-sizes.ts`               | 36   |
| `sizeLabel`                 | Function | `src/lib/services/image-providers/model-sizes.ts`               | 46   |
| `intersectModelSizes`       | Function | `src/lib/services/image-providers/model-sizes.ts`               | 77   |
| `withConcrete`              | Function | `src/lib/services/image-providers/model-sizes.ts`               | 82   |
| `load`                      | Function | `src/routes/image-generator/+page.server.ts`                    | 5    |
| `stringArray`               | Function | `src/lib/services/image-providers/imagerouter-models.server.ts` | 27   |
| `toModelList`               | Function | `src/lib/services/image-providers/imagerouter-models.server.ts` | 35   |
| `fetchImageRouterModelCaps` | Function | `src/lib/services/image-providers/imagerouter-models.server.ts` | 57   |
| `buildImageGeneratorConfig` | Function | `src/lib/services/image-providers/config.server.ts`             | 66   |
| `GET`                       | Function | `src/routes/api/images/config/+server.ts`                       | 5    |
| `getImageProvider`          | Function | `src/lib/services/image-providers/factory.server.ts`            | 5    |
| `splitModelId`              | Function | `src/lib/services/image-providers/model-display.ts`             | 18   |
| `modelLabel`                | Function | `src/lib/services/image-providers/model-display.ts`             | 28   |

## Execution Flows

| Flow                                   | Type            | Steps |
| -------------------------------------- | --------------- | ----- |
| `POST → LoadEnvFileValues`             | cross_community | 7     |
| `Load → LoadEnvFileValues`             | cross_community | 6     |
| `GET → LoadEnvFileValues`              | cross_community | 6     |
| `POST → FetchFn`                       | cross_community | 5     |
| `POST → SafeJson`                      | cross_community | 5     |
| `POST → PromptEnhancerError`           | cross_community | 5     |
| `POST → NormalizeClarifyingQuestions`  | cross_community | 5     |
| `POST → ToModelList`                   | cross_community | 5     |
| `POST → StringArray`                   | cross_community | 5     |
| `GetImageProvider → LoadEnvFileValues` | cross_community | 5     |

## Connected Areas

| Area     | Connections |
| -------- | ----------- |
| Server   | 3 calls     |
| Services | 2 calls     |

## How to Explore

1. `gitnexus_context({name: "parseSize"})` — see callers and callees
2. `gitnexus_query({query: "image-providers"})` — find related execution flows
3. Read key files listed above for implementation details
