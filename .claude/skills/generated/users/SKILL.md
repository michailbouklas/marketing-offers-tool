---
name: users
description: "Skill for the Users area of marketing-offers-tool. 8 symbols across 6 files."
---

# Users

8 symbols | 6 files | Cohesion: 60%

## When to Use

- Working with code in `src/`
- Understanding how listBrands, requirePermission, createUser work
- Modifying users-related functionality

## Key Files

| File                                            | Symbols                |
| ----------------------------------------------- | ---------------------- |
| `src/routes/admin/users/+page.server.ts`        | createUser, updateUser |
| `src/routes/admin/dim-offers/export/+server.ts` | formatNumber, GET      |
| `src/lib/services/brands.server.ts`             | listBrands             |
| `src/lib/server/auth-guards.ts`                 | requirePermission      |
| `src/routes/admin/dim-offers/+page.server.ts`   | load                   |
| `src/routes/admin/brands/+page.server.ts`       | load                   |

## Entry Points

Start here when exploring this area:

- **`listBrands`** (Function) — `src/lib/services/brands.server.ts:7`
- **`requirePermission`** (Function) — `src/lib/server/auth-guards.ts:77`
- **`createUser`** (Function) — `src/routes/admin/users/+page.server.ts:42`
- **`updateUser`** (Function) — `src/routes/admin/users/+page.server.ts:74`
- **`load`** (Function) — `src/routes/admin/dim-offers/+page.server.ts:35`

## Key Symbols

| Symbol              | Type     | File                                            | Line |
| ------------------- | -------- | ----------------------------------------------- | ---- |
| `listBrands`        | Function | `src/lib/services/brands.server.ts`             | 7    |
| `requirePermission` | Function | `src/lib/server/auth-guards.ts`                 | 77   |
| `createUser`        | Function | `src/routes/admin/users/+page.server.ts`        | 42   |
| `updateUser`        | Function | `src/routes/admin/users/+page.server.ts`        | 74   |
| `load`              | Function | `src/routes/admin/dim-offers/+page.server.ts`   | 35   |
| `load`              | Function | `src/routes/admin/brands/+page.server.ts`       | 5    |
| `GET`               | Function | `src/routes/admin/dim-offers/export/+server.ts` | 53   |
| `formatNumber`      | Function | `src/routes/admin/dim-offers/export/+server.ts` | 49   |

## Execution Flows

| Flow                              | Type            | Steps |
| --------------------------------- | --------------- | ----- |
| `GET → GetSortExpression`         | cross_community | 4     |
| `Load → RequireAuthenticatedUser` | cross_community | 3     |
| `Load → HasPermission`            | cross_community | 3     |
| `Load → RequireAuthenticatedUser` | cross_community | 3     |
| `Load → HasPermission`            | cross_community | 3     |
| `Load → BuildFilterClauses`       | cross_community | 3     |
| `Load → BuildWhereClause`         | cross_community | 3     |
| `Load → BuildBaseQueryParams`     | cross_community | 3     |
| `Load → ShouldJoinResolvedBrands` | cross_community | 3     |
| `GET → RequireAuthenticatedUser`  | cross_community | 3     |

## Connected Areas

| Area              | Connections |
| ----------------- | ----------- |
| Server            | 2 calls     |
| Services          | 2 calls     |
| Aggregator-offers | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "listBrands"})` — see callers and callees
2. `gitnexus_query({query: "users"})` — find related execution flows
3. Read key files listed above for implementation details
