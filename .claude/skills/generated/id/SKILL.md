---
name: id
description: "Skill for the [id] area of marketing-offers-tool. 6 symbols across 6 files."
---

# [id]

6 symbols | 6 files | Cohesion: 50%

## When to Use

- Working with code in `src/`
- Understanding how requireAuthenticatedApiUser, buildImageGeneratorConfig, GET work
- Modifying [id]-related functionality

## Key Files

| File                                                | Symbols                     |
| --------------------------------------------------- | --------------------------- |
| `src/lib/server/auth-guards.ts`                     | requireAuthenticatedApiUser |
| `src/lib/services/image-providers/config.server.ts` | buildImageGeneratorConfig   |
| `src/routes/api/images/config/+server.ts`           | GET                         |
| `src/routes/api/brand-assets/[id]/+server.ts`       | GET                         |
| `src/routes/api/images/[id]/file/+server.ts`        | GET                         |
| `src/routes/api/images/references/[id]/+server.ts`  | GET                         |

## Entry Points

Start here when exploring this area:

- **`requireAuthenticatedApiUser`** (Function) — `src/lib/server/auth-guards.ts:16`
- **`buildImageGeneratorConfig`** (Function) — `src/lib/services/image-providers/config.server.ts:7`
- **`GET`** (Function) — `src/routes/api/images/config/+server.ts:5`
- **`GET`** (Function) — `src/routes/api/brand-assets/[id]/+server.ts:6`
- **`GET`** (Function) — `src/routes/api/images/[id]/file/+server.ts:6`

## Key Symbols

| Symbol                        | Type     | File                                                | Line |
| ----------------------------- | -------- | --------------------------------------------------- | ---- |
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

| Area   | Connections |
| ------ | ----------- |
| Server | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "requireAuthenticatedApiUser"})` — see callers and callees
2. `gitnexus_query({query: "[id]"})` — find related execution flows
3. Read key files listed above for implementation details
