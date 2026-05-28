---
name: routes
description: "Skill for the Routes area of marketing-offers-tool. 12 symbols across 9 files."
---

# Routes

12 symbols | 9 files | Cohesion: 57%

## When to Use

- Working with code in `src/`
- Understanding how load, load, load work
- Modifying routes-related functionality

## Key Files

| File                                            | Symbols                                    |
| ----------------------------------------------- | ------------------------------------------ |
| `src/lib/server/auth-guards.ts`                 | requireAdminUser, getAuthenticatedUserRole |
| `src/routes/admin/users/+page.server.ts`        | createUser, updateUser                     |
| `src/routes/admin/dim-offers/export/+server.ts` | formatNumber, GET                          |
| `src/routes/+page.server.ts`                    | load                                       |
| `src/routes/+layout.server.ts`                  | load                                       |
| `src/routes/admin/+page.server.ts`              | load                                       |
| `src/lib/services/brands.server.ts`             | listBrands                                 |
| `src/routes/admin/dim-offers/+page.server.ts`   | load                                       |
| `src/routes/admin/brands/+page.server.ts`       | load                                       |

## Entry Points

Start here when exploring this area:

- **`load`** (Function) — `src/routes/+page.server.ts:7`
- **`load`** (Function) — `src/routes/+layout.server.ts:3`
- **`load`** (Function) — `src/routes/admin/+page.server.ts:3`
- **`listBrands`** (Function) — `src/lib/services/brands.server.ts:7`
- **`requireAdminUser`** (Function) — `src/lib/server/auth-guards.ts:27`

## Key Symbols

| Symbol                     | Type     | File                                            | Line |
| -------------------------- | -------- | ----------------------------------------------- | ---- |
| `load`                     | Function | `src/routes/+page.server.ts`                    | 7    |
| `load`                     | Function | `src/routes/+layout.server.ts`                  | 3    |
| `load`                     | Function | `src/routes/admin/+page.server.ts`              | 3    |
| `listBrands`               | Function | `src/lib/services/brands.server.ts`             | 7    |
| `requireAdminUser`         | Function | `src/lib/server/auth-guards.ts`                 | 27   |
| `getAuthenticatedUserRole` | Function | `src/lib/server/auth-guards.ts`                 | 45   |
| `createUser`               | Function | `src/routes/admin/users/+page.server.ts`        | 40   |
| `updateUser`               | Function | `src/routes/admin/users/+page.server.ts`        | 72   |
| `load`                     | Function | `src/routes/admin/dim-offers/+page.server.ts`   | 35   |
| `load`                     | Function | `src/routes/admin/brands/+page.server.ts`       | 5    |
| `GET`                      | Function | `src/routes/admin/dim-offers/export/+server.ts` | 53   |
| `formatNumber`             | Function | `src/routes/admin/dim-offers/export/+server.ts` | 49   |

## Execution Flows

| Flow                              | Type            | Steps |
| --------------------------------- | --------------- | ----- |
| `GET → GetSortExpression`         | cross_community | 4     |
| `Load → RequireAuthenticatedUser` | cross_community | 3     |
| `Load → GetAuthenticatedUserRole` | cross_community | 3     |
| `Load → IsAdminRole`              | cross_community | 3     |
| `POST → RequireAuthenticatedUser` | cross_community | 3     |
| `POST → GetAuthenticatedUserRole` | cross_community | 3     |
| `POST → IsAdminRole`              | cross_community | 3     |
| `GET → RequireAuthenticatedUser`  | cross_community | 3     |
| `GET → GetAuthenticatedUserRole`  | cross_community | 3     |
| `GET → IsAdminRole`               | cross_community | 3     |

## Connected Areas

| Area              | Connections |
| ----------------- | ----------- |
| Services          | 3 calls     |
| Aggregator-offers | 2 calls     |
| Server            | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "load"})` — see callers and callees
2. `gitnexus_query({query: "routes"})` — find related execution flows
3. Read key files listed above for implementation details
