---
name: image-providers
description: "Skill for the Image-providers area of marketing-offers-tool. 61 symbols across 18 files."
---

# Image-providers

61 symbols | 18 files | Cohesion: 82%

## When to Use

- Working with code in `src/`
- Understanding how POST, load, stringArray work
- Modifying image-providers-related functionality

## Key Files

| File                                                            | Symbols                                                                                                   |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/lib/services/image-providers/openai.server.ts`             | OpenAIProviderError, generateImage, send, postGenerations, postEdits (+4)                                 |
| `src/lib/services/image-providers/structured-prompt.server.ts`  | StructuredPromptSuggesterError, StructuredPromptSuggester, suggest, parseSuggestionContent, str (+3)      |
| `src/lib/services/image-providers/enhance.server.ts`            | PromptEnhancerError, callChatCompletion, parseEnhanceContent, normalizeClarifyingQuestions, safeJson (+3) |
| `src/lib/services/image-providers/model-sizes.ts`               | greatestCommonDivisor, parseSize, ratioOf, sizeLabel, concreteSizes (+2)                                  |
| `src/lib/services/image-providers/imagerouter.server.ts`        | ImageRouterImageProvider, ImageRouterProviderError, generateImage, safeParseError, resolveImageBytes (+1) |
| `src/lib/services/image-providers/types.ts`                     | isProviderRequestError, generateImage, generateImage, ImageProvider, FakeProvider                         |
| `src/lib/services/image-providers/imagerouter-models.server.ts` | stringArray, toModelList, fetchImageRouterModelCaps                                                       |
| `src/lib/services/image-generator/orchestrate.server.ts`        | toJsonValue, recordFailureLog, generateWithFailureLogging                                                 |
| `src/lib/services/copywriter/generate.server.ts`                | toJsonValue, recordFailureLogs                                                                            |
| `src/lib/services/image-providers/model-display.ts`             | splitModelId, modelLabel                                                                                  |

## Entry Points

Start here when exploring this area:

- **`POST`** (Function) — `src/routes/api/images/structured-prompt/+server.ts:12`
- **`load`** (Function) — `src/routes/image-generator/+page.server.ts:9`
- **`stringArray`** (Function) — `src/lib/services/image-providers/imagerouter-models.server.ts:27`
- **`toModelList`** (Function) — `src/lib/services/image-providers/imagerouter-models.server.ts:35`
- **`fetchImageRouterModelCaps`** (Function) — `src/lib/services/image-providers/imagerouter-models.server.ts:57`

## Key Symbols

| Symbol                           | Type     | File                                                            | Line |
| -------------------------------- | -------- | --------------------------------------------------------------- | ---- |
| `StructuredPromptSuggesterError` | Class    | `src/lib/services/image-providers/structured-prompt.server.ts`  | 79   |
| `StructuredPromptSuggester`      | Class    | `src/lib/services/image-providers/structured-prompt.server.ts`  | 90   |
| `OpenAIProviderError`            | Class    | `src/lib/services/image-providers/openai.server.ts`             | 16   |
| `FakeProvider`                   | Class    | `src/lib/services/image-providers/types.ts`                     | 77   |
| `OpenAIImageProvider`            | Class    | `src/lib/services/image-providers/openai.server.ts`             | 44   |
| `ImageRouterImageProvider`       | Class    | `src/lib/services/image-providers/imagerouter.server.ts`        | 43   |
| `ImageRouterProviderError`       | Class    | `src/lib/services/image-providers/imagerouter.server.ts`        | 12   |
| `PromptEnhancerError`            | Class    | `src/lib/services/image-providers/enhance.server.ts`            | 95   |
| `PromptEnhancer`                 | Class    | `src/lib/services/image-providers/enhance.server.ts`            | 106  |
| `POST`                           | Function | `src/routes/api/images/structured-prompt/+server.ts`            | 12   |
| `load`                           | Function | `src/routes/image-generator/+page.server.ts`                    | 9    |
| `stringArray`                    | Function | `src/lib/services/image-providers/imagerouter-models.server.ts` | 27   |
| `toModelList`                    | Function | `src/lib/services/image-providers/imagerouter-models.server.ts` | 35   |
| `fetchImageRouterModelCaps`      | Function | `src/lib/services/image-providers/imagerouter-models.server.ts` | 57   |
| `buildImageGeneratorConfig`      | Function | `src/lib/services/image-providers/config.server.ts`             | 66   |
| `listPresetsForUser`             | Function | `src/lib/services/image-generator/composer-library.server.ts`   | 84   |
| `GET`                            | Function | `src/routes/api/images/presets/+server.ts`                      | 9    |
| `GET`                            | Function | `src/routes/api/images/config/+server.ts`                       | 5    |
| `isProviderRequestError`         | Function | `src/lib/services/image-providers/types.ts`                     | 56   |
| `parseSize`                      | Function | `src/lib/services/image-providers/model-sizes.ts`               | 17   |

## Execution Flows

| Flow                                  | Type            | Steps |
| ------------------------------------- | --------------- | ----- |
| `Load → LoadEnvFileValues`            | cross_community | 6     |
| `GET → LoadEnvFileValues`             | cross_community | 6     |
| `POST → FetchFn`                      | cross_community | 5     |
| `POST → SafeJson`                     | cross_community | 5     |
| `POST → PromptEnhancerError`          | cross_community | 5     |
| `POST → NormalizeClarifyingQuestions` | cross_community | 5     |
| `POST → LoadEnvFileValues`            | cross_community | 5     |
| `POST → ToModelList`                  | cross_community | 5     |
| `POST → StringArray`                  | cross_community | 5     |
| `Load → ToModelList`                  | intra_community | 4     |

## Connected Areas

| Area            | Connections |
| --------------- | ----------- |
| Server          | 5 calls     |
| [id]            | 4 calls     |
| Services        | 2 calls     |
| Image-generator | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "POST"})` — see callers and callees
2. `gitnexus_query({query: "image-providers"})` — find related execution flows
3. Read key files listed above for implementation details
