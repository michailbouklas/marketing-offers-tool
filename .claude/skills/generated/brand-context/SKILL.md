---
name: brand-context
description: "Skill for the Brand-context area of marketing-offers-tool. 5 symbols across 3 files."
---

# Brand-context

5 symbols | 3 files | Cohesion: 73%

## When to Use

- Working with code in `src/`
- Understanding how getBrandAsset, deleteBrandAsset, DELETE work
- Modifying brand-context-related functionality

## Key Files

| File                                                                | Symbols                         |
| ------------------------------------------------------------------- | ------------------------------- |
| `src/lib/services/brand-context/brand-context.server.ts`            | getBrandAsset, deleteBrandAsset |
| `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts` | parseBrandId, DELETE            |
| `src/lib/server/object-store.server.ts`                             | remove                          |

## Entry Points

Start here when exploring this area:

- **`getBrandAsset`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:28`
- **`deleteBrandAsset`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:68`
- **`DELETE`** (Function) — `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts:19`
- **`remove`** (Method) — `src/lib/server/object-store.server.ts:26`

## Key Symbols

| Symbol             | Type     | File                                                                | Line |
| ------------------ | -------- | ------------------------------------------------------------------- | ---- |
| `getBrandAsset`    | Function | `src/lib/services/brand-context/brand-context.server.ts`            | 28   |
| `deleteBrandAsset` | Function | `src/lib/services/brand-context/brand-context.server.ts`            | 68   |
| `DELETE`           | Function | `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts` | 19   |
| `remove`           | Method   | `src/lib/server/object-store.server.ts`                             | 26   |
| `parseBrandId`     | Function | `src/routes/api/admin/brands/[brandId]/assets/[assetId]/+server.ts` | 8    |

## Execution Flows

| Flow                                   | Type            | Steps |
| -------------------------------------- | --------------- | ----- |
| `DELETE → LoadEnvFileValues`           | cross_community | 6     |
| `DELETE → GetSupabaseClient`           | cross_community | 4     |
| `DELETE → SupabaseObjectStore`         | cross_community | 4     |
| `DELETE → LocalObjectStore`            | cross_community | 4     |
| `DELETE → RequireAuthenticatedApiUser` | cross_community | 3     |
| `DELETE → HasPermission`               | cross_community | 3     |
| `DELETE → Remove`                      | intra_community | 3     |

## Connected Areas

| Area       | Connections |
| ---------- | ----------- |
| Server     | 1 calls     |
| Guidelines | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "getBrandAsset"})` — see callers and callees
2. `gitnexus_query({query: "brand-context"})` — find related execution flows
3. Read key files listed above for implementation details
