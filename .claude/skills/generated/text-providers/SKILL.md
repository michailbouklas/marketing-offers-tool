---
name: text-providers
description: "Skill for the Text-providers area of marketing-offers-tool. 10 symbols across 5 files."
---

# Text-providers

10 symbols | 5 files | Cohesion: 77%

## When to Use

- Working with code in `src/`
- Understanding how getTextProvider, FakeTextProvider, OpenAITextProvider work
- Modifying text-providers-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/services/text-providers/openai.server.ts` | OpenAITextProvider, OpenAITextProviderError, generateText, safeJson |
| `src/lib/services/text-providers/types.ts` | TextProvider, FakeTextProvider |
| `src/lib/services/text-providers/openai.server.test.ts` | jsonResponse, fetchMock |
| `src/lib/services/text-providers/factory.server.ts` | getTextProvider |
| `src/lib/services/image-providers/types.ts` | ProviderRequestError |

## Entry Points

Start here when exploring this area:

- **`getTextProvider`** (Function) — `src/lib/services/text-providers/factory.server.ts:4`
- **`FakeTextProvider`** (Class) — `src/lib/services/text-providers/types.ts:41`
- **`OpenAITextProvider`** (Class) — `src/lib/services/text-providers/openai.server.ts:43`
- **`OpenAITextProviderError`** (Class) — `src/lib/services/text-providers/openai.server.ts:11`
- **`generateText`** (Method) — `src/lib/services/text-providers/openai.server.ts:52`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `FakeTextProvider` | Class | `src/lib/services/text-providers/types.ts` | 41 |
| `OpenAITextProvider` | Class | `src/lib/services/text-providers/openai.server.ts` | 43 |
| `OpenAITextProviderError` | Class | `src/lib/services/text-providers/openai.server.ts` | 11 |
| `getTextProvider` | Function | `src/lib/services/text-providers/factory.server.ts` | 4 |
| `TextProvider` | Interface | `src/lib/services/text-providers/types.ts` | 30 |
| `ProviderRequestError` | Interface | `src/lib/services/image-providers/types.ts` | 50 |
| `generateText` | Method | `src/lib/services/text-providers/openai.server.ts` | 52 |
| `safeJson` | Function | `src/lib/services/text-providers/openai.server.ts` | 161 |
| `jsonResponse` | Function | `src/lib/services/text-providers/openai.server.test.ts` | 20 |
| `fetchMock` | Function | `src/lib/services/text-providers/openai.server.test.ts` | 29 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `POST → FetchFn` | cross_community | 4 |
| `POST → OpenAITextProviderError` | cross_community | 4 |
| `POST → SafeJson` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Server | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getTextProvider"})` — see callers and callees
2. `gitnexus_query({query: "text-providers"})` — find related execution flows
3. Read key files listed above for implementation details
