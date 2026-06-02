---
name: brand-context
description: "Skill for the Brand-context area of marketing-offers-tool. 4 symbols across 2 files."
---

# Brand-context

4 symbols | 2 files | Cohesion: 86%

## When to Use

- Working with code in `src/`
- Understanding how getBrandAsset, deleteBrandAsset, DELETE work
- Modifying brand-context-related functionality

## Key Files

| File                                                                | Symbols                         |
| ------------------------------------------------------------------- | ------------------------------- |
| `src/lib/services/brand-context/brand-context.server.ts`            | getBrandAsset, deleteBrandAsset |
| `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts` | parseBrandId, DELETE            |

## Entry Points

Start here when exploring this area:

- **`getBrandAsset`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:28`
- **`deleteBrandAsset`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:69`
- **`DELETE`** (Function) — `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts:19`

## Key Symbols

| Symbol             | Type     | File                                                                | Line |
| ------------------ | -------- | ------------------------------------------------------------------- | ---- |
| `getBrandAsset`    | Function | `src/lib/services/brand-context/brand-context.server.ts`            | 28   |
| `deleteBrandAsset` | Function | `src/lib/services/brand-context/brand-context.server.ts`            | 69   |
| `DELETE`           | Function | `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts` | 19   |
| `parseBrandId`     | Function | `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts` | 8    |

## Execution Flows

| Flow                                | Type            | Steps |
| ----------------------------------- | --------------- | ----- |
| `DELETE → RequireAuthenticatedUser` | cross_community | 3     |
| `DELETE → GetAuthenticatedUserRole` | cross_community | 3     |
| `DELETE → IsAdminRole`              | cross_community | 3     |

## Connected Areas

| Area   | Connections |
| ------ | ----------- |
| Server | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "getBrandAsset"})` — see callers and callees
2. `gitnexus_query({query: "brand-context"})` — find related execution flows
3. Read key files listed above for implementation details
