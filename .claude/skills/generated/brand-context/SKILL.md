---
name: brand-context
description: "Skill for the Brand-context area of marketing-offers-tool. 6 symbols across 2 files."
---

# Brand-context

6 symbols | 2 files | Cohesion: 75%

## When to Use

- Working with code in `src/`
- Understanding how getBrandAsset, updateBrandAssetName, deleteBrandAsset work
- Modifying brand-context-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/services/brand-context/brand-context.server.ts` | getBrandAsset, updateBrandAssetName, deleteBrandAsset |
| `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts` | parseBrandId, PATCH, DELETE |

## Entry Points

Start here when exploring this area:

- **`getBrandAsset`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:68`
- **`updateBrandAssetName`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:108`
- **`deleteBrandAsset`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:118`
- **`PATCH`** (Function) — `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts:25`
- **`DELETE`** (Function) — `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts:48`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getBrandAsset` | Function | `src/lib/services/brand-context/brand-context.server.ts` | 68 |
| `updateBrandAssetName` | Function | `src/lib/services/brand-context/brand-context.server.ts` | 108 |
| `deleteBrandAsset` | Function | `src/lib/services/brand-context/brand-context.server.ts` | 118 |
| `PATCH` | Function | `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts` | 25 |
| `DELETE` | Function | `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts` | 48 |
| `parseBrandId` | Function | `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts` | 14 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `DELETE → LoadEnvFileValues` | cross_community | 6 |
| `DELETE → GetSupabaseClient` | cross_community | 4 |
| `DELETE → SupabaseObjectStore` | cross_community | 4 |
| `DELETE → LocalObjectStore` | cross_community | 4 |
| `PATCH → RequireAuthenticatedApiUser` | cross_community | 3 |
| `PATCH → HasPermission` | cross_community | 3 |
| `DELETE → RequireAuthenticatedApiUser` | cross_community | 3 |
| `DELETE → HasPermission` | cross_community | 3 |
| `DELETE → Remove` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Guidelines | 2 calls |
| Inspiration | 1 calls |
| Server | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getBrandAsset"})` — see callers and callees
2. `gitnexus_query({query: "brand-context"})` — find related execution flows
3. Read key files listed above for implementation details
