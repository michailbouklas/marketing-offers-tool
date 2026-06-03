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

| File | Symbols |
|------|---------|
| `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | parseBrandId, GET, POST |
| `src/lib/services/brand-context/brand-context.server.ts` | createBrandAsset |

## Entry Points

Start here when exploring this area:

- **`createBrandAsset`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:46`
- **`GET`** (Function) — `src/routes/api/admin/brands/[brandId]/assets/+server.ts:21`
- **`POST`** (Function) — `src/routes/api/admin/brands/[brandId]/assets/+server.ts:41`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `createBrandAsset` | Function | `src/lib/services/brand-context/brand-context.server.ts` | 46 |
| `GET` | Function | `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | 21 |
| `POST` | Function | `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | 41 |
| `parseBrandId` | Function | `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | 10 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `POST → AssertSafeKey` | cross_community | 6 |
| `POST → From` | cross_community | 5 |
| `CreateBrandAsset → LoadEnvFileValues` | cross_community | 5 |
| `POST → ParseRoles` | cross_community | 4 |
| `POST → Put` | cross_community | 4 |
| `POST → EnsureSafeSlug` | cross_community | 4 |
| `POST → GetSupabaseClient` | cross_community | 4 |
| `POST → SupabaseObjectStore` | cross_community | 4 |
| `POST → LocalObjectStore` | cross_community | 4 |
| `GET → ParseRoles` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Server | 3 calls |
| Services | 2 calls |
| Brand-context | 1 calls |

## How to Explore

1. `gitnexus_context({name: "createBrandAsset"})` — see callers and callees
2. `gitnexus_query({query: "assets"})` — find related execution flows
3. Read key files listed above for implementation details
