---
name: assets
description: "Skill for the Assets area of marketing-offers-tool. 4 symbols across 2 files."
---

# Assets

4 symbols | 2 files | Cohesion: 50%

## When to Use

- Working with code in `src/`
- Understanding how createBrandAsset, GET, POST work
- Modifying assets-related functionality

## Key Files

| File                                                      | Symbols                 |
| --------------------------------------------------------- | ----------------------- |
| `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | parseBrandId, GET, POST |
| `src/lib/services/brand-context/brand-context.server.ts`  | createBrandAsset        |

## Entry Points

Start here when exploring this area:

- **`createBrandAsset`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:47`
- **`GET`** (Function) — `src/routes/api/admin/brands/[brandId]/assets/+server.ts:22`
- **`POST`** (Function) — `src/routes/api/admin/brands/[brandId]/assets/+server.ts:42`

## Key Symbols

| Symbol             | Type     | File                                                      | Line |
| ------------------ | -------- | --------------------------------------------------------- | ---- |
| `createBrandAsset` | Function | `src/lib/services/brand-context/brand-context.server.ts`  | 47   |
| `GET`              | Function | `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | 22   |
| `POST`             | Function | `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | 42   |
| `parseBrandId`     | Function | `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | 11   |

## Execution Flows

| Flow                                | Type            | Steps |
| ----------------------------------- | --------------- | ----- |
| `CreateBrandAsset → EnsureSafeSlug` | cross_community | 6     |
| `POST → LoadEnvFileValues`          | cross_community | 5     |
| `POST → ParseRoles`                 | cross_community | 4     |
| `GET → ParseRoles`                  | cross_community | 4     |
| `POST → RequireAuthenticatedUser`   | cross_community | 3     |
| `POST → GetAuthenticatedUserRole`   | cross_community | 3     |
| `GET → RequireAuthenticatedUser`    | cross_community | 3     |
| `GET → GetAuthenticatedUserRole`    | cross_community | 3     |

## Connected Areas

| Area   | Connections |
| ------ | ----------- |
| Server | 6 calls     |

## How to Explore

1. `gitnexus_context({name: "createBrandAsset"})` — see callers and callees
2. `gitnexus_query({query: "assets"})` — find related execution flows
3. Read key files listed above for implementation details
