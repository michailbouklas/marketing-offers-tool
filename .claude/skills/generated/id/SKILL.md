---
name: id
description: "Skill for the [id] area of marketing-offers-tool. 7 symbols across 7 files."
---

# [id]

7 symbols | 7 files | Cohesion: 52%

## When to Use

- Working with code in `src/`
- Understanding how load, requireAuthenticatedApiUser, buildImageGeneratorConfig work
- Modifying [id]-related functionality

## Key Files

| File                                                | Symbols                     |
| --------------------------------------------------- | --------------------------- |
| `src/routes/image-generator/+page.server.ts`        | load                        |
| `src/lib/server/auth-guards.ts`                     | requireAuthenticatedApiUser |
| `src/lib/services/image-providers/config.server.ts` | buildImageGeneratorConfig   |
| `src/routes/api/images/config/+server.ts`           | GET                         |
| `src/routes/api/brand-assets/[id]/+server.ts`       | GET                         |
| `src/routes/api/images/[id]/file/+server.ts`        | GET                         |
| `src/routes/api/images/references/[id]/+server.ts`  | GET                         |

## Entry Points

Start here when exploring this area:

- **`load`** (Function) — `src/routes/image-generator/+page.server.ts:5`
- **`requireAuthenticatedApiUser`** (Function) — `src/lib/server/auth-guards.ts:16`
- **`buildImageGeneratorConfig`** (Function) — `src/lib/services/image-providers/config.server.ts:7`
- **`GET`** (Function) — `src/routes/api/images/config/+server.ts:5`
- **`GET`** (Function) — `src/routes/api/brand-assets/[id]/+server.ts:6`

## Key Symbols

| Symbol                        | Type     | File                                                | Line |
| ----------------------------- | -------- | --------------------------------------------------- | ---- |
| `load`                        | Function | `src/routes/image-generator/+page.server.ts`        | 5    |
| `requireAuthenticatedApiUser` | Function | `src/lib/server/auth-guards.ts`                     | 16   |
| `buildImageGeneratorConfig`   | Function | `src/lib/services/image-providers/config.server.ts` | 7    |
| `GET`                         | Function | `src/routes/api/images/config/+server.ts`           | 5    |
| `GET`                         | Function | `src/routes/api/brand-assets/[id]/+server.ts`       | 6    |
| `GET`                         | Function | `src/routes/api/images/[id]/file/+server.ts`        | 6    |
| `GET`                         | Function | `src/routes/api/images/references/[id]/+server.ts`  | 6    |

## Execution Flows

| Flow                                           | Type            | Steps |
| ---------------------------------------------- | --------------- | ----- |
| `Load → LoadEnvFileValues`                     | cross_community | 6     |
| `GET → LoadEnvFileValues`                      | cross_community | 6     |
| `CreatePendingGenerations → LoadEnvFileValues` | cross_community | 6     |

## Connected Areas

| Area              | Connections |
| ----------------- | ----------- |
| Aggregator-offers | 1 calls     |
| Services          | 1 calls     |
| Server            | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "load"})` — see callers and callees
2. `gitnexus_query({query: "[id]"})` — find related execution flows
3. Read key files listed above for implementation details
