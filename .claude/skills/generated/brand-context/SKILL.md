---
name: brand-context
description: "Skill for the Brand-context area of marketing-offers-tool. 11 symbols across 5 files."
---

# Brand-context

11 symbols | 5 files | Cohesion: 61%

## When to Use

- Working with code in `src/`
- Understanding how getBrandAsset, updateBrandAssetName, deleteBrandAsset work
- Modifying brand-context-related functionality

## Key Files

| File                                                                | Symbols                                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/lib/services/brand-context/brand-context.server.ts`            | getBrandAsset, updateBrandAssetName, deleteBrandAsset, listBrandAssets, getBrandGuidelines |
| `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts` | parseBrandId, PATCH, DELETE                                                                |
| `src/routes/api/brand-guidelines/+server.ts`                        | GET                                                                                        |
| `src/routes/admin/brands/[id]/+page.server.ts`                      | load                                                                                       |
| `src/routes/api/admin/brands/[brandId]/assets/+server.ts`           | GET                                                                                        |

## Entry Points

Start here when exploring this area:

- **`getBrandAsset`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:68`
- **`updateBrandAssetName`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:108`
- **`deleteBrandAsset`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:118`
- **`PATCH`** (Function) — `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts:25`
- **`DELETE`** (Function) — `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts:48`

## Key Symbols

| Symbol                 | Type     | File                                                                | Line |
| ---------------------- | -------- | ------------------------------------------------------------------- | ---- |
| `getBrandAsset`        | Function | `src/lib/services/brand-context/brand-context.server.ts`            | 68   |
| `updateBrandAssetName` | Function | `src/lib/services/brand-context/brand-context.server.ts`            | 108  |
| `deleteBrandAsset`     | Function | `src/lib/services/brand-context/brand-context.server.ts`            | 118  |
| `PATCH`                | Function | `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts` | 25   |
| `DELETE`               | Function | `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts` | 48   |
| `GET`                  | Function | `src/routes/api/brand-guidelines/+server.ts`                        | 6    |
| `listBrandAssets`      | Function | `src/lib/services/brand-context/brand-context.server.ts`            | 20   |
| `getBrandGuidelines`   | Function | `src/lib/services/brand-context/brand-context.server.ts`            | 130  |
| `load`                 | Function | `src/routes/admin/brands/[id]/+page.server.ts`                      | 10   |
| `GET`                  | Function | `src/routes/api/admin/brands/[brandId]/assets/+server.ts`           | 21   |
| `parseBrandId`         | Function | `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts` | 14   |

## Execution Flows

| Flow                              | Type            | Steps |
| --------------------------------- | --------------- | ----- |
| `GET → AssertSafeKey`             | cross_community | 6     |
| `GET → LoadEnvFileValues`         | cross_community | 6     |
| `DELETE → LoadEnvFileValues`      | cross_community | 6     |
| `GET → AssertSafeKey`             | cross_community | 6     |
| `GET → LoadEnvFileValues`         | cross_community | 6     |
| `Load → From`                     | cross_community | 5     |
| `Load → AssertSafeKey`            | cross_community | 5     |
| `Load → EnsureSafeSlug`           | cross_community | 5     |
| `Load → GetCompetitionDatabase`   | cross_community | 5     |
| `Load → GetGoogleReviewsDatabase` | cross_community | 5     |

## Connected Areas

| Area        | Connections |
| ----------- | ----------- |
| Server      | 5 calls     |
| Services    | 5 calls     |
| Inspiration | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "getBrandAsset"})` — see callers and callees
2. `gitnexus_query({query: "brand-context"})` — find related execution flows
3. Read key files listed above for implementation details
