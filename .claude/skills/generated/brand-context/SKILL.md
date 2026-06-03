---
name: brand-context
description: "Skill for the Brand-context area of marketing-offers-tool. 10 symbols across 6 files."
---

# Brand-context

10 symbols | 6 files | Cohesion: 61%

## When to Use

- Working with code in `src/`
- Understanding how getBrandAsset, deleteBrandAsset, DELETE work
- Modifying brand-context-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/services/brand-context/brand-context.server.ts` | getBrandAsset, deleteBrandAsset, listBrandAssets, getBrandGuidelines |
| `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts` | parseBrandId, DELETE |
| `src/lib/server/object-store.server.ts` | remove |
| `src/routes/api/brand-guidelines/+server.ts` | GET |
| `src/routes/api/brand-assets/+server.ts` | GET |
| `src/routes/admin/brands/[id]/+page.server.ts` | load |

## Entry Points

Start here when exploring this area:

- **`getBrandAsset`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:28`
- **`deleteBrandAsset`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:68`
- **`DELETE`** (Function) — `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts:19`
- **`GET`** (Function) — `src/routes/api/brand-guidelines/+server.ts:6`
- **`GET`** (Function) — `src/routes/api/brand-assets/+server.ts:6`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getBrandAsset` | Function | `src/lib/services/brand-context/brand-context.server.ts` | 28 |
| `deleteBrandAsset` | Function | `src/lib/services/brand-context/brand-context.server.ts` | 68 |
| `DELETE` | Function | `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts` | 19 |
| `GET` | Function | `src/routes/api/brand-guidelines/+server.ts` | 6 |
| `GET` | Function | `src/routes/api/brand-assets/+server.ts` | 6 |
| `listBrandAssets` | Function | `src/lib/services/brand-context/brand-context.server.ts` | 19 |
| `getBrandGuidelines` | Function | `src/lib/services/brand-context/brand-context.server.ts` | 80 |
| `load` | Function | `src/routes/admin/brands/[id]/+page.server.ts` | 9 |
| `remove` | Method | `src/lib/server/object-store.server.ts` | 26 |
| `parseBrandId` | Function | `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts` | 8 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `GET → AssertSafeKey` | cross_community | 6 |
| `DELETE → LoadEnvFileValues` | cross_community | 6 |
| `Load → AssertSafeKey` | cross_community | 6 |
| `Load → LoadEnvFileValues` | cross_community | 6 |
| `GET → AssertSafeKey` | cross_community | 6 |
| `GET → LoadEnvFileValues` | cross_community | 6 |
| `GET → From` | cross_community | 5 |
| `GET → EnsureSafeSlug` | cross_community | 5 |
| `Load → From` | cross_community | 5 |
| `Load → EnsureSafeSlug` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Server | 5 calls |
| Aggregator-offers | 1 calls |
| Services | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getBrandAsset"})` — see callers and callees
2. `gitnexus_query({query: "brand-context"})` — find related execution flows
3. Read key files listed above for implementation details
