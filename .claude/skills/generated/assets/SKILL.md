---
name: assets
description: "Skill for the Assets area of marketing-offers-tool. 5 symbols across 4 files."
---

# Assets

5 symbols | 4 files | Cohesion: 57%

## When to Use

- Working with code in `src/`
- Understanding how GET, listBrandAssets, load work
- Modifying assets-related functionality

## Key Files

| File                                                      | Symbols           |
| --------------------------------------------------------- | ----------------- |
| `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | parseBrandId, GET |
| `src/routes/api/brand-assets/+server.ts`                  | GET               |
| `src/lib/services/brand-context/brand-context.server.ts`  | listBrandAssets   |
| `src/routes/admin/brands/[id]/+page.server.ts`            | load              |

## Entry Points

Start here when exploring this area:

- **`GET`** (Function) — `src/routes/api/brand-assets/+server.ts:6`
- **`listBrandAssets`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:19`
- **`load`** (Function) — `src/routes/admin/brands/[id]/+page.server.ts:10`
- **`GET`** (Function) — `src/routes/api/admin/brands/[brandId]/assets/+server.ts:22`

## Key Symbols

| Symbol            | Type     | File                                                      | Line |
| ----------------- | -------- | --------------------------------------------------------- | ---- |
| `GET`             | Function | `src/routes/api/brand-assets/+server.ts`                  | 6    |
| `listBrandAssets` | Function | `src/lib/services/brand-context/brand-context.server.ts`  | 19   |
| `load`            | Function | `src/routes/admin/brands/[id]/+page.server.ts`            | 10   |
| `GET`             | Function | `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | 22   |
| `parseBrandId`    | Function | `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | 11   |

## Execution Flows

| Flow                              | Type            | Steps |
| --------------------------------- | --------------- | ----- |
| `Load → EnsureSafeSlug`           | cross_community | 6     |
| `Load → LoadEnvFileValues`        | cross_community | 5     |
| `Load → ParseRoles`               | cross_community | 4     |
| `GET → ParseRoles`                | cross_community | 4     |
| `Load → RequireAuthenticatedUser` | cross_community | 3     |
| `Load → GetAuthenticatedUserRole` | cross_community | 3     |
| `GET → RequireAuthenticatedUser`  | cross_community | 3     |
| `GET → GetAuthenticatedUserRole`  | cross_community | 3     |

## Connected Areas

| Area       | Connections |
| ---------- | ----------- |
| Server     | 3 calls     |
| [id]       | 1 calls     |
| Guidelines | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "GET"})` — see callers and callees
2. `gitnexus_query({query: "assets"})` — find related execution flows
3. Read key files listed above for implementation details
