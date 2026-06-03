---
name: image-providers
description: "Skill for the Image-providers area of marketing-offers-tool. 34 symbols across 7 files."
---

# Image-providers

34 symbols | 7 files | Cohesion: 85%

## When to Use

- Working with code in `src/`
- Understanding how parseSize, ratioOf, sizeLabel work
- Modifying image-providers-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/services/image-providers/openai.server.ts` | OpenAIProviderError, generateImage, postGenerations, postEdits, safeParseError (+3) |
| `src/lib/services/image-providers/enhance.server.ts` | PromptEnhancerError, callChatCompletion, parseEnhanceContent, normalizeClarifyingQuestions, safeJson (+3) |
| `src/lib/services/image-providers/model-sizes.ts` | greatestCommonDivisor, parseSize, ratioOf, sizeLabel, concreteSizes (+2) |
| `src/lib/services/image-providers/imagerouter.server.ts` | ImageRouterImageProvider, ImageRouterProviderError, generateImage, safeParseError, resolveImageBytes (+1) |
| `src/lib/services/image-providers/types.ts` | ImageProvider, FakeProvider |
| `src/routes/api/images/enhance/+server.ts` | POST, loadReferenceImages |
| `src/lib/services/image-providers/factory.server.ts` | getImageProvider |

## Entry Points

Start here when exploring this area:

- **`parseSize`** (Function) — `src/lib/services/image-providers/model-sizes.ts:17`
- **`ratioOf`** (Function) — `src/lib/services/image-providers/model-sizes.ts:36`
- **`sizeLabel`** (Function) — `src/lib/services/image-providers/model-sizes.ts:46`
- **`intersectModelSizes`** (Function) — `src/lib/services/image-providers/model-sizes.ts:77`
- **`withConcrete`** (Function) — `src/lib/services/image-providers/model-sizes.ts:82`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `OpenAIProviderError` | Class | `src/lib/services/image-providers/openai.server.ts` | 14 |
| `FakeProvider` | Class | `src/lib/services/image-providers/types.ts` | 38 |
| `OpenAIImageProvider` | Class | `src/lib/services/image-providers/openai.server.ts` | 41 |
| `ImageRouterImageProvider` | Class | `src/lib/services/image-providers/imagerouter.server.ts` | 33 |
| `ImageRouterProviderError` | Class | `src/lib/services/image-providers/imagerouter.server.ts` | 6 |
| `PromptEnhancerError` | Class | `src/lib/services/image-providers/enhance.server.ts` | 95 |
| `PromptEnhancer` | Class | `src/lib/services/image-providers/enhance.server.ts` | 106 |
| `parseSize` | Function | `src/lib/services/image-providers/model-sizes.ts` | 17 |
| `ratioOf` | Function | `src/lib/services/image-providers/model-sizes.ts` | 36 |
| `sizeLabel` | Function | `src/lib/services/image-providers/model-sizes.ts` | 46 |
| `intersectModelSizes` | Function | `src/lib/services/image-providers/model-sizes.ts` | 77 |
| `withConcrete` | Function | `src/lib/services/image-providers/model-sizes.ts` | 82 |
| `getImageProvider` | Function | `src/lib/services/image-providers/factory.server.ts` | 5 |
| `POST` | Function | `src/routes/api/images/enhance/+server.ts` | 23 |
| `ImageProvider` | Interface | `src/lib/services/image-providers/types.ts` | 27 |
| `generateImage` | Method | `src/lib/services/image-providers/openai.server.ts` | 50 |
| `postGenerations` | Method | `src/lib/services/image-providers/openai.server.ts` | 97 |
| `postEdits` | Method | `src/lib/services/image-providers/openai.server.ts` | 125 |
| `generateImage` | Method | `src/lib/services/image-providers/imagerouter.server.ts` | 42 |
| `callChatCompletion` | Method | `src/lib/services/image-providers/enhance.server.ts` | 187 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `POST → FetchFn` | cross_community | 5 |
| `POST → SafeJson` | cross_community | 5 |
| `POST → PromptEnhancerError` | cross_community | 5 |
| `POST → NormalizeClarifyingQuestions` | cross_community | 5 |
| `POST → SafeParseError` | cross_community | 5 |
| `POST → OpenAIProviderError` | cross_community | 5 |
| `POST → FetchFn` | cross_community | 5 |
| `POST → ContentTypeFromPath` | cross_community | 5 |
| `POST → SafeParseError` | cross_community | 5 |
| `KickoffPendingGenerations → FetchFn` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Server | 2 calls |
| [id] | 1 calls |

## How to Explore

1. `gitnexus_context({name: "parseSize"})` — see callers and callees
2. `gitnexus_query({query: "image-providers"})` — find related execution flows
3. Read key files listed above for implementation details
