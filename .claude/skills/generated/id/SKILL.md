---
name: id
description: "Skill for the [id] area of marketing-offers-tool. 6 symbols across 6 files."
---

# [id]

6 symbols | 6 files | Cohesion: 53%

## When to Use

- Working with code in `src/`
- Understanding how requireAuthenticatedApiUser, getGeneratedImageUsageByDayForUser, GET work
- Modifying [id]-related functionality

## Key Files

| File                                                         | Symbols                            |
| ------------------------------------------------------------ | ---------------------------------- |
| `src/lib/server/auth-guards.ts`                              | requireAuthenticatedApiUser        |
| `src/lib/services/image-generator/image-generator.server.ts` | getGeneratedImageUsageByDayForUser |
| `src/routes/api/images/usage/+server.ts`                     | GET                                |
| `src/routes/api/brand-assets/[id]/+server.ts`                | GET                                |
| `src/routes/api/images/[id]/file/+server.ts`                 | GET                                |
| `src/routes/api/images/references/[id]/+server.ts`           | GET                                |

## Entry Points

Start here when exploring this area:

- **`requireAuthenticatedApiUser`** (Function) — `src/lib/server/auth-guards.ts:16`
- **`getGeneratedImageUsageByDayForUser`** (Function) — `src/lib/services/image-generator/image-generator.server.ts:293`
- **`GET`** (Function) — `src/routes/api/images/usage/+server.ts:5`
- **`GET`** (Function) — `src/routes/api/brand-assets/[id]/+server.ts:6`
- **`GET`** (Function) — `src/routes/api/images/[id]/file/+server.ts:6`

## Key Symbols

| Symbol                               | Type     | File                                                         | Line |
| ------------------------------------ | -------- | ------------------------------------------------------------ | ---- |
| `requireAuthenticatedApiUser`        | Function | `src/lib/server/auth-guards.ts`                              | 16   |
| `getGeneratedImageUsageByDayForUser` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 293  |
| `GET`                                | Function | `src/routes/api/images/usage/+server.ts`                     | 5    |
| `GET`                                | Function | `src/routes/api/brand-assets/[id]/+server.ts`                | 6    |
| `GET`                                | Function | `src/routes/api/images/[id]/file/+server.ts`                 | 6    |
| `GET`                                | Function | `src/routes/api/images/references/[id]/+server.ts`           | 6    |

## Execution Flows

| Flow                | Type            | Steps |
| ------------------- | --------------- | ----- |
| `GET → ToUtcDayKey` | cross_community | 4     |

## Connected Areas

| Area            | Connections |
| --------------- | ----------- |
| Image-generator | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "requireAuthenticatedApiUser"})` — see callers and callees
2. `gitnexus_query({query: "[id]"})` — find related execution flows
3. Read key files listed above for implementation details
