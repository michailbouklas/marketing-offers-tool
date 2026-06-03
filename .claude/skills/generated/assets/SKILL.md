---
name: assets
description: "Skill for the Assets area of marketing-offers-tool. 7 symbols across 4 files."
---

# Assets

7 symbols | 4 files | Cohesion: 60%

## When to Use

- Working with code in `src/`
- Understanding how listBrandAssets, createBrandAsset, GET work
- Modifying assets-related functionality

## Key Files

| File                                                      | Symbols                           |
| --------------------------------------------------------- | --------------------------------- |
| `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | parseBrandId, GET, POST           |
| `src/lib/services/brand-context/brand-context.server.ts`  | listBrandAssets, createBrandAsset |
| `src/routes/api/brand-assets/+server.ts`                  | GET                               |
| `src/routes/admin/brands/[id]/+page.server.ts`            | load                              |

## Entry Points

Start here when exploring this area:

- **`listBrandAssets`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:19`
- **`createBrandAsset`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:46`
- **`GET`** (Function) — `src/routes/api/brand-assets/+server.ts:6`
- **`load`** (Function) — `src/routes/admin/brands/[id]/+page.server.ts:9`
- **`GET`** (Function) — `src/routes/api/admin/brands/[brandId]/assets/+server.ts:21`

## Key Symbols

| Symbol             | Type     | File                                                      | Line |
| ------------------ | -------- | --------------------------------------------------------- | ---- |
| `listBrandAssets`  | Function | `src/lib/services/brand-context/brand-context.server.ts`  | 19   |
| `createBrandAsset` | Function | `src/lib/services/brand-context/brand-context.server.ts`  | 46   |
| `GET`              | Function | `src/routes/api/brand-assets/+server.ts`                  | 6    |
| `load`             | Function | `src/routes/admin/brands/[id]/+page.server.ts`            | 9    |
| `GET`              | Function | `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | 21   |
| `POST`             | Function | `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | 41   |
| `parseBrandId`     | Function | `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | 10   |

## Execution Flows

| Flow                       | Type            | Steps |
| -------------------------- | --------------- | ----- |
| `POST → AssertSafeKey`     | cross_community | 6     |
| `POST → LoadEnvFileValues` | cross_community | 6     |
| `Load → AssertSafeKey`     | cross_community | 6     |
| `Load → LoadEnvFileValues` | cross_community | 6     |
| `POST → From`              | cross_community | 5     |
| `Load → From`              | cross_community | 5     |
| `Load → EnsureSafeSlug`    | cross_community | 5     |
| `POST → Put`               | cross_community | 4     |
| `POST → EnsureSafeSlug`    | cross_community | 4     |
| `POST → GetSupabaseClient` | cross_community | 4     |

## Connected Areas

| Area       | Connections |
| ---------- | ----------- |
| Server     | 5 calls     |
| Guidelines | 2 calls     |
| Services   | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "listBrandAssets"})` — see callers and callees
2. `gitnexus_query({query: "assets"})` — find related execution flows
3. Read key files listed above for implementation details
