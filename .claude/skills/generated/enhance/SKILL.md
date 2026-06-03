---
name: enhance
description: "Skill for the Enhance area of marketing-offers-tool. 4 symbols across 3 files."
---

# Enhance

4 symbols | 3 files | Cohesion: 43%

## When to Use

- Working with code in `src/`
- Understanding how POST, PromptEnhancer, tryGet work
- Modifying enhance-related functionality

## Key Files

| File                                                 | Symbols                   |
| ---------------------------------------------------- | ------------------------- |
| `src/routes/api/images/enhance/+server.ts`           | POST, loadReferenceImages |
| `src/lib/server/object-store.server.ts`              | tryGet                    |
| `src/lib/services/image-providers/enhance.server.ts` | PromptEnhancer            |

## Entry Points

Start here when exploring this area:

- **`POST`** (Function) — `src/routes/api/images/enhance/+server.ts:23`
- **`PromptEnhancer`** (Class) — `src/lib/services/image-providers/enhance.server.ts:106`
- **`tryGet`** (Method) — `src/lib/server/object-store.server.ts:73`

## Key Symbols

| Symbol                | Type     | File                                                 | Line |
| --------------------- | -------- | ---------------------------------------------------- | ---- |
| `PromptEnhancer`      | Class    | `src/lib/services/image-providers/enhance.server.ts` | 106  |
| `POST`                | Function | `src/routes/api/images/enhance/+server.ts`           | 23   |
| `tryGet`              | Method   | `src/lib/server/object-store.server.ts`              | 73   |
| `loadReferenceImages` | Function | `src/routes/api/images/enhance/+server.ts`           | 69   |

## Execution Flows

| Flow                                      | Type            | Steps |
| ----------------------------------------- | --------------- | ----- |
| `POST → FetchFn`                          | cross_community | 5     |
| `POST → SafeJson`                         | cross_community | 5     |
| `POST → PromptEnhancerError`              | cross_community | 5     |
| `POST → NormalizeClarifyingQuestions`     | cross_community | 5     |
| `LoadReferenceImages → LoadEnvFileValues` | cross_community | 5     |
| `LoadReferenceImages → AssertSafeKey`     | cross_community | 4     |

## Connected Areas

| Area            | Connections |
| --------------- | ----------- |
| Server          | 6 calls     |
| Image-providers | 2 calls     |

## How to Explore

1. `gitnexus_context({name: "POST"})` — see callers and callees
2. `gitnexus_query({query: "enhance"})` — find related execution flows
3. Read key files listed above for implementation details
