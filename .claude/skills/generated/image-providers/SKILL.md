---
name: image-providers
description: "Skill for the Image-providers area of marketing-offers-tool. 33 symbols across 9 files."
---

# Image-providers

33 symbols | 9 files | Cohesion: 79%

## When to Use

- Working with code in `src/`
- Understanding how resizeToRequested, generateOneRow, kickoffPendingGenerations work
- Modifying image-providers-related functionality

## Key Files

| File                                                     | Symbols                                                                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/lib/services/image-providers/openai.server.ts`      | OpenAIProviderError, generateImage, postGenerations, postEdits, safeParseError (+3)                       |
| `src/lib/services/image-providers/enhance.server.ts`     | PromptEnhancerError, callChatCompletion, parseEnhanceContent, normalizeClarifyingQuestions, safeJson (+3) |
| `src/lib/services/image-providers/imagerouter.server.ts` | ImageRouterImageProvider, ImageRouterProviderError, generateImage, safeParseError, resolveImageBytes (+1) |
| `src/lib/services/image-providers/types.ts`              | generateImage, generateImage, ImageProvider, FakeProvider                                                 |
| `src/lib/services/image-generator/orchestrate.server.ts` | generateOneRow, kickoffPendingGenerations                                                                 |
| `src/routes/api/images/enhance/+server.ts`               | POST, loadReferenceImages                                                                                 |
| `src/lib/server/image-size.ts`                           | resizeToRequested                                                                                         |
| `src/routes/api/images/generate/+server.ts`              | POST                                                                                                      |
| `src/lib/services/image-providers/factory.server.ts`     | getImageProvider                                                                                          |

## Entry Points

Start here when exploring this area:

- **`resizeToRequested`** (Function) — `src/lib/server/image-size.ts:78`
- **`generateOneRow`** (Function) — `src/lib/services/image-generator/orchestrate.server.ts:8`
- **`kickoffPendingGenerations`** (Function) — `src/lib/services/image-generator/orchestrate.server.ts:93`
- **`POST`** (Function) — `src/routes/api/images/generate/+server.ts:10`
- **`getImageProvider`** (Function) — `src/lib/services/image-providers/factory.server.ts:5`

## Key Symbols

| Symbol                      | Type      | File                                                     | Line |
| --------------------------- | --------- | -------------------------------------------------------- | ---- |
| `OpenAIProviderError`       | Class     | `src/lib/services/image-providers/openai.server.ts`      | 7    |
| `FakeProvider`              | Class     | `src/lib/services/image-providers/types.ts`              | 24   |
| `OpenAIImageProvider`       | Class     | `src/lib/services/image-providers/openai.server.ts`      | 34   |
| `ImageRouterImageProvider`  | Class     | `src/lib/services/image-providers/imagerouter.server.ts` | 33   |
| `ImageRouterProviderError`  | Class     | `src/lib/services/image-providers/imagerouter.server.ts` | 6    |
| `PromptEnhancerError`       | Class     | `src/lib/services/image-providers/enhance.server.ts`     | 95   |
| `PromptEnhancer`            | Class     | `src/lib/services/image-providers/enhance.server.ts`     | 106  |
| `resizeToRequested`         | Function  | `src/lib/server/image-size.ts`                           | 78   |
| `generateOneRow`            | Function  | `src/lib/services/image-generator/orchestrate.server.ts` | 8    |
| `kickoffPendingGenerations` | Function  | `src/lib/services/image-generator/orchestrate.server.ts` | 93   |
| `POST`                      | Function  | `src/routes/api/images/generate/+server.ts`              | 10   |
| `getImageProvider`          | Function  | `src/lib/services/image-providers/factory.server.ts`     | 5    |
| `POST`                      | Function  | `src/routes/api/images/enhance/+server.ts`               | 23   |
| `ImageProvider`             | Interface | `src/lib/services/image-providers/types.ts`              | 13   |
| `generateImage`             | Method    | `src/lib/services/image-providers/openai.server.ts`      | 43   |
| `postGenerations`           | Method    | `src/lib/services/image-providers/openai.server.ts`      | 81   |
| `postEdits`                 | Method    | `src/lib/services/image-providers/openai.server.ts`      | 101  |
| `generateImage`             | Method    | `src/lib/services/image-providers/types.ts`              | 14   |
| `generateImage`             | Method    | `src/lib/services/image-providers/types.ts`              | 27   |
| `generateImage`             | Method    | `src/lib/services/image-providers/imagerouter.server.ts` | 42   |

## Execution Flows

| Flow                                  | Type            | Steps |
| ------------------------------------- | --------------- | ----- |
| `POST → LoadEnvFileValues`            | cross_community | 6     |
| `POST → FetchFn`                      | cross_community | 6     |
| `POST → FetchFn`                      | cross_community | 5     |
| `POST → SafeJson`                     | cross_community | 5     |
| `POST → PromptEnhancerError`          | cross_community | 5     |
| `POST → NormalizeClarifyingQuestions` | cross_community | 5     |
| `POST → SafeParseError`               | cross_community | 5     |
| `POST → OpenAIProviderError`          | cross_community | 5     |
| `POST → FetchFn`                      | cross_community | 5     |
| `POST → ContentTypeFromPath`          | cross_community | 5     |

## Connected Areas

| Area            | Connections |
| --------------- | ----------- |
| Server          | 4 calls     |
| [id]            | 2 calls     |
| Image-generator | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "resizeToRequested"})` — see callers and callees
2. `gitnexus_query({query: "image-providers"})` — find related execution flows
3. Read key files listed above for implementation details
