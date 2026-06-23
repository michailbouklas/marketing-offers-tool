---
name: assets
description: "Skill for the Assets area of marketing-offers-tool. 6 symbols across 3 files."
---

# Assets

6 symbols | 3 files | Cohesion: 59%

## When to Use

- Working with code in `src/`
- Understanding how listBrandAssets, createBrandAsset, load work
- Modifying assets-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | parseBrandId, GET, POST |
| `src/lib/services/brand-context/brand-context.server.ts` | listBrandAssets, createBrandAsset |
| `src/routes/admin/brands/[id]/+page.server.ts` | load |

## Entry Points

Start here when exploring this area:

- **`listBrandAssets`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:20`
- **`createBrandAsset`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:86`
- **`load`** (Function) — `src/routes/admin/brands/[id]/+page.server.ts:9`
- **`GET`** (Function) — `src/routes/api/admin/brands/[brandId]/assets/+server.ts:21`
- **`POST`** (Function) — `src/routes/api/admin/brands/[brandId]/assets/+server.ts:41`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `listBrandAssets` | Function | `src/lib/services/brand-context/brand-context.server.ts` | 20 |
| `createBrandAsset` | Function | `src/lib/services/brand-context/brand-context.server.ts` | 86 |
| `load` | Function | `src/routes/admin/brands/[id]/+page.server.ts` | 9 |
| `GET` | Function | `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | 21 |
| `POST` | Function | `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | 41 |
| `parseBrandId` | Function | `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | 10 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `POST → AssertSafeKey` | cross_community | 6 |
| `POST → LoadEnvFileValues` | cross_community | 6 |
| `Load → AssertSafeKey` | cross_community | 6 |
| `Load → LoadEnvFileValues` | cross_community | 6 |
| `POST → From` | cross_community | 5 |
| `Load → From` | cross_community | 5 |
| `Load → EnsureSafeSlug` | cross_community | 5 |
| `POST → Put` | cross_community | 4 |
| `POST → EnsureSafeSlug` | cross_community | 4 |
| `POST → GetSupabaseClient` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Server | 3 calls |
| Guidelines | 2 calls |
| Services | 1 calls |
| Image-generator | 1 calls |

## How to Explore

1. `gitnexus_context({name: "listBrandAssets"})` — see callers and callees
2. `gitnexus_query({query: "assets"})` — find related execution flows
3. Read key files listed above for implementation details
