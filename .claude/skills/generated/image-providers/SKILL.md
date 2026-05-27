---
name: image-providers
description: "Skill for the Image-providers area of marketing-offers-tool. 31 symbols across 9 files."
---

# Image-providers

31 symbols | 9 files | Cohesion: 84%

## When to Use

- Working with code in `src/`
- Understanding how POST, resizeToRequested, generateOneRow work
- Modifying image-providers-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/services/image-providers/openai.server.ts` | OpenAIProviderError, generateImage, postGenerations, postEdits, safeParseError (+3) |
| `src/lib/services/image-providers/enhance.server.ts` | PromptEnhancerError, PromptEnhancer, enhance, parseEnhanceContent, normalizeClarifyingQuestions (+1) |
| `src/lib/services/image-providers/imagerouter.server.ts` | ImageRouterImageProvider, ImageRouterProviderError, generateImage, safeParseError, resolveImageBytes (+1) |
| `src/lib/services/image-providers/types.ts` | generateImage, generateImage, ImageProvider, FakeProvider |
| `src/routes/api/images/enhance/+server.ts` | POST, loadReferenceImages |
| `src/lib/services/image-generator/orchestrate.server.ts` | generateOneRow, kickoffPendingGenerations |
| `src/lib/server/image-size.ts` | resizeToRequested |
| `src/routes/api/images/generate/+server.ts` | POST |
| `src/lib/services/image-providers/factory.server.ts` | getImageProvider |

## Entry Points

Start here when exploring this area:

- **`POST`** (Function) — `src/routes/api/images/enhance/+server.ts:15`
- **`resizeToRequested`** (Function) — `src/lib/server/image-size.ts:78`
- **`generateOneRow`** (Function) — `src/lib/services/image-generator/orchestrate.server.ts:6`
- **`kickoffPendingGenerations`** (Function) — `src/lib/services/image-generator/orchestrate.server.ts:86`
- **`POST`** (Function) — `src/routes/api/images/generate/+server.ts:10`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `PromptEnhancerError` | Class | `src/lib/services/image-providers/enhance.server.ts` | 56 |
| `PromptEnhancer` | Class | `src/lib/services/image-providers/enhance.server.ts` | 67 |
| `OpenAIProviderError` | Class | `src/lib/services/image-providers/openai.server.ts` | 7 |
| `FakeProvider` | Class | `src/lib/services/image-providers/types.ts` | 24 |
| `OpenAIImageProvider` | Class | `src/lib/services/image-providers/openai.server.ts` | 34 |
| `ImageRouterImageProvider` | Class | `src/lib/services/image-providers/imagerouter.server.ts` | 33 |
| `ImageRouterProviderError` | Class | `src/lib/services/image-providers/imagerouter.server.ts` | 6 |
| `POST` | Function | `src/routes/api/images/enhance/+server.ts` | 15 |
| `resizeToRequested` | Function | `src/lib/server/image-size.ts` | 78 |
| `generateOneRow` | Function | `src/lib/services/image-generator/orchestrate.server.ts` | 6 |
| `kickoffPendingGenerations` | Function | `src/lib/services/image-generator/orchestrate.server.ts` | 86 |
| `POST` | Function | `src/routes/api/images/generate/+server.ts` | 10 |
| `getImageProvider` | Function | `src/lib/services/image-providers/factory.server.ts` | 5 |
| `ImageProvider` | Interface | `src/lib/services/image-providers/types.ts` | 13 |
| `enhance` | Method | `src/lib/services/image-providers/enhance.server.ts` | 78 |
| `generateImage` | Method | `src/lib/services/image-providers/openai.server.ts` | 43 |
| `postGenerations` | Method | `src/lib/services/image-providers/openai.server.ts` | 81 |
| `postEdits` | Method | `src/lib/services/image-providers/openai.server.ts` | 101 |
| `generateImage` | Method | `src/lib/services/image-providers/types.ts` | 14 |
| `generateImage` | Method | `src/lib/services/image-providers/types.ts` | 27 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `POST → LoadEnvFileValues` | cross_community | 6 |
| `POST → FetchFn` | cross_community | 6 |
| `POST → LoadEnvFileValues` | cross_community | 5 |
| `POST → SafeParseError` | cross_community | 5 |
| `POST → OpenAIProviderError` | cross_community | 5 |
| `POST → FetchFn` | cross_community | 5 |
| `POST → ContentTypeFromPath` | cross_community | 5 |
| `POST → SafeParseError` | cross_community | 5 |
| `POST → ImageRouterProviderError` | cross_community | 5 |
| `KickoffPendingGenerations → ContentTypeFromPath` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Server | 5 calls |
| [id] | 2 calls |

## How to Explore

1. `gitnexus_context({name: "POST"})` — see callers and callees
2. `gitnexus_query({query: "image-providers"})` — find related execution flows
3. Read key files listed above for implementation details
