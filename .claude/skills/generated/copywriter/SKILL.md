---
name: copywriter
description: "Skill for the Copywriter area of marketing-offers-tool. 17 symbols across 7 files."
---

# Copywriter

17 symbols | 7 files | Cohesion: 80%

## When to Use

- Working with code in `src/`
- Understanding how getChannelConstraints, buildCopySystemPrompt, buildCopyJsonSchema work
- Modifying copywriter-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/services/copywriter/generate.server.ts` | CopyGenerateValidationError, buildCopySystemPrompt, buildCopyJsonSchema, parseVariants, generateCopy (+1) |
| `src/lib/services/copywriter/copywriter-client.ts` | submitCopyGeneration, fetchCopyHistory, rateVariant, jsonOrThrow |
| `src/lib/services/text-providers/types.ts` | generateText, generateText |
| `src/lib/services/copywriter/copywriter.server.ts` | CopyFeedbackError, updateVariantFeedback |
| `src/lib/services/copywriter/types.ts` | getChannelConstraints |
| `src/routes/api/copy/generate/+server.ts` | POST |
| `src/routes/api/copy/[id]/+server.ts` | PATCH |

## Entry Points

Start here when exploring this area:

- **`getChannelConstraints`** (Function) — `src/lib/services/copywriter/types.ts:121`
- **`buildCopySystemPrompt`** (Function) — `src/lib/services/copywriter/generate.server.ts:85`
- **`buildCopyJsonSchema`** (Function) — `src/lib/services/copywriter/generate.server.ts:139`
- **`parseVariants`** (Function) — `src/lib/services/copywriter/generate.server.ts:184`
- **`generateCopy`** (Function) — `src/lib/services/copywriter/generate.server.ts:334`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `CopyGenerateValidationError` | Class | `src/lib/services/copywriter/generate.server.ts` | 53 |
| `CopyFeedbackError` | Class | `src/lib/services/copywriter/copywriter.server.ts` | 56 |
| `getChannelConstraints` | Function | `src/lib/services/copywriter/types.ts` | 121 |
| `buildCopySystemPrompt` | Function | `src/lib/services/copywriter/generate.server.ts` | 85 |
| `buildCopyJsonSchema` | Function | `src/lib/services/copywriter/generate.server.ts` | 139 |
| `parseVariants` | Function | `src/lib/services/copywriter/generate.server.ts` | 184 |
| `generateCopy` | Function | `src/lib/services/copywriter/generate.server.ts` | 334 |
| `POST` | Function | `src/routes/api/copy/generate/+server.ts` | 9 |
| `toGeneratedCopyDTO` | Function | `src/lib/services/copywriter/generate.server.ts` | 285 |
| `updateVariantFeedback` | Function | `src/lib/services/copywriter/copywriter.server.ts` | 78 |
| `PATCH` | Function | `src/routes/api/copy/[id]/+server.ts` | 15 |
| `submitCopyGeneration` | Function | `src/lib/services/copywriter/copywriter-client.ts` | 25 |
| `fetchCopyHistory` | Function | `src/lib/services/copywriter/copywriter-client.ts` | 36 |
| `rateVariant` | Function | `src/lib/services/copywriter/copywriter-client.ts` | 48 |
| `generateText` | Method | `src/lib/services/text-providers/types.ts` | 31 |
| `generateText` | Method | `src/lib/services/text-providers/types.ts` | 44 |
| `jsonOrThrow` | Function | `src/lib/services/copywriter/copywriter-client.ts` | 61 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `POST → FetchFn` | cross_community | 4 |
| `POST → OpenAITextProviderError` | cross_community | 4 |
| `POST → SafeJson` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Text-providers | 2 calls |
| Services | 2 calls |
| Brand-context | 1 calls |
| Image-generator | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getChannelConstraints"})` — see callers and callees
2. `gitnexus_query({query: "copywriter"})` — find related execution flows
3. Read key files listed above for implementation details
