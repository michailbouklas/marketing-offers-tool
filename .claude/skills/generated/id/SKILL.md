---
name: id
description: "Skill for the [id] area of marketing-offers-tool. 14 symbols across 11 files."
---

# [id]

14 symbols | 11 files | Cohesion: 54%

## When to Use

- Working with code in `src/`
- Understanding how requireAuthenticatedApiUser, hasSuperUserRole, GET work
- Modifying [id]-related functionality

## Key Files

| File                                                          | Symbols                                       |
| ------------------------------------------------------------- | --------------------------------------------- |
| `src/lib/server/auth-guards.ts`                               | requireAuthenticatedApiUser, hasSuperUserRole |
| `src/lib/services/image-generator/composer-library.server.ts` | deletePreset, deleteTemplate                  |
| `src/routes/api/images/[id]/file/+server.ts`                  | generatedImageKey, GET                        |
| `src/lib/server/object-store.server.ts`                       | tryGet                                        |
| `src/routes/api/brand-assets/+server.ts`                      | GET                                           |
| `src/lib/services/brand-context/brand-context.server.ts`      | searchBrandAssets                             |
| `src/routes/api/images/usage/+server.ts`                      | GET                                           |
| `src/routes/api/brand-assets/[id]/+server.ts`                 | GET                                           |
| `src/routes/api/images/templates/[id]/+server.ts`             | DELETE                                        |
| `src/routes/api/images/presets/[id]/+server.ts`               | DELETE                                        |

## Entry Points

Start here when exploring this area:

- **`requireAuthenticatedApiUser`** (Function) — `src/lib/server/auth-guards.ts:23`
- **`hasSuperUserRole`** (Function) — `src/lib/server/auth-guards.ts:82`
- **`GET`** (Function) — `src/routes/api/brand-assets/+server.ts:8`
- **`deletePreset`** (Function) — `src/lib/services/image-generator/composer-library.server.ts:140`
- **`deleteTemplate`** (Function) — `src/lib/services/image-generator/composer-library.server.ts:252`

## Key Symbols

| Symbol                        | Type     | File                                                          | Line |
| ----------------------------- | -------- | ------------------------------------------------------------- | ---- |
| `requireAuthenticatedApiUser` | Function | `src/lib/server/auth-guards.ts`                               | 23   |
| `hasSuperUserRole`            | Function | `src/lib/server/auth-guards.ts`                               | 82   |
| `GET`                         | Function | `src/routes/api/brand-assets/+server.ts`                      | 8    |
| `deletePreset`                | Function | `src/lib/services/image-generator/composer-library.server.ts` | 140  |
| `deleteTemplate`              | Function | `src/lib/services/image-generator/composer-library.server.ts` | 252  |
| `searchBrandAssets`           | Function | `src/lib/services/brand-context/brand-context.server.ts`      | 41   |
| `GET`                         | Function | `src/routes/api/images/usage/+server.ts`                      | 8    |
| `GET`                         | Function | `src/routes/api/brand-assets/[id]/+server.ts`                 | 6    |
| `GET`                         | Function | `src/routes/api/images/[id]/file/+server.ts`                  | 16   |
| `DELETE`                      | Function | `src/routes/api/images/templates/[id]/+server.ts`             | 28   |
| `DELETE`                      | Function | `src/routes/api/images/presets/[id]/+server.ts`               | 28   |
| `GET`                         | Function | `src/routes/api/images/references/[id]/+server.ts`            | 6    |
| `tryGet`                      | Method   | `src/lib/server/object-store.server.ts`                       | 33   |
| `generatedImageKey`           | Function | `src/routes/api/images/[id]/file/+server.ts`                  | 9    |

## Execution Flows

| Flow                                 | Type            | Steps |
| ------------------------------------ | --------------- | ----- |
| `GET → LoadEnvFileValues`            | cross_community | 5     |
| `GET → LoadEnvFileValues`            | cross_community | 5     |
| `GET → ParseRoles`                   | cross_community | 4     |
| `GET → ParseRoles`                   | cross_community | 4     |
| `GET → ToUtcDayKey`                  | cross_community | 4     |
| `GET → GetAuthenticatedUserRole`     | cross_community | 3     |
| `POST → RequireAuthenticatedApiUser` | cross_community | 3     |
| `PUT → RequireAuthenticatedApiUser`  | cross_community | 3     |

## Connected Areas

| Area            | Connections |
| --------------- | ----------- |
| Server          | 5 calls     |
| Image-generator | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "requireAuthenticatedApiUser"})` — see callers and callees
2. `gitnexus_query({query: "[id]"})` — find related execution flows
3. Read key files listed above for implementation details
