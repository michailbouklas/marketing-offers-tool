---
name: export
description: "Skill for the Export area of marketing-offers-tool. 5 symbols across 4 files."
---

# Export

5 symbols | 4 files | Cohesion: 44%

## When to Use

- Working with code in `src/`
- Understanding how listBrands, load, load work
- Modifying export-related functionality

## Key Files

| File                                                 | Symbols           |
| ---------------------------------------------------- | ----------------- |
| `src/routes/admin/dim-offers/export/+server.ts`      | formatNumber, GET |
| `src/lib/services/brands.server.ts`                  | listBrands        |
| `src/routes/admin/brands/+page.server.ts`            | load              |
| `src/routes/admin/brand-assignments/+page.server.ts` | load              |

## Entry Points

Start here when exploring this area:

- **`listBrands`** (Function) — `src/lib/services/brands.server.ts:7`
- **`load`** (Function) — `src/routes/admin/brands/+page.server.ts:5`
- **`load`** (Function) — `src/routes/admin/brand-assignments/+page.server.ts:13`
- **`GET`** (Function) — `src/routes/admin/dim-offers/export/+server.ts:53`

## Key Symbols

| Symbol         | Type     | File                                                 | Line |
| -------------- | -------- | ---------------------------------------------------- | ---- |
| `listBrands`   | Function | `src/lib/services/brands.server.ts`                  | 7    |
| `load`         | Function | `src/routes/admin/brands/+page.server.ts`            | 5    |
| `load`         | Function | `src/routes/admin/brand-assignments/+page.server.ts` | 13   |
| `GET`          | Function | `src/routes/admin/dim-offers/export/+server.ts`      | 53   |
| `formatNumber` | Function | `src/routes/admin/dim-offers/export/+server.ts`      | 49   |

## Execution Flows

| Flow                               | Type            | Steps |
| ---------------------------------- | --------------- | ----- |
| `Load → GetCompetitionDatabase`    | cross_community | 5     |
| `Load → GetGoogleReviewsDatabase`  | cross_community | 5     |
| `GET → GetSortExpression`          | cross_community | 4     |
| `Load → DecodeCompetitionEntityId` | cross_community | 4     |

## Connected Areas

| Area     | Connections |
| -------- | ----------- |
| Services | 4 calls     |
| Server   | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "listBrands"})` — see callers and callees
2. `gitnexus_query({query: "export"})` — find related execution flows
3. Read key files listed above for implementation details
