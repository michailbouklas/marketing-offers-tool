---
name: server
description: "Skill for the Server area of marketing-offers-tool. 31 symbols across 11 files."
---

# Server

31 symbols | 11 files | Cohesion: 85%

## When to Use

- Working with code in `src/`
- Understanding how load, listBrands, requireAdminUser work
- Modifying server-related functionality

## Key Files

| File                                            | Symbols                                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/lib/server/clickhouse.ts`                  | loadEnvFileValues, parseRequestTimeout, getRequiredEnv, getEnvValue, getClickHouseConfig (+4) |
| `src/lib/server/auth.ts`                        | getRequiredEnv, getAuthConfig, getAuthConfigKey, createAuth, getAuth                          |
| `src/lib/server/auth-guards.ts`                 | requireAdminUser, getAuthenticatedUserRole, isPublicPath, isAdminPath                         |
| `src/lib/server/prisma.ts`                      | getDatabaseUrl, createPrismaClient, hasDataQualityDelegates, getPrismaClient                  |
| `src/routes/admin/users/+page.server.ts`        | createUser, updateUser                                                                        |
| `src/routes/admin/dim-offers/export/+server.ts` | formatNumber, GET                                                                             |
| `src/routes/+layout.server.ts`                  | load                                                                                          |
| `src/lib/services/brands.server.ts`             | listBrands                                                                                    |
| `src/routes/admin/dim-offers/+page.server.ts`   | load                                                                                          |
| `src/hooks.server.ts`                           | sessionHandle                                                                                 |

## Entry Points

Start here when exploring this area:

- **`load`** (Function) — `src/routes/+layout.server.ts:3`
- **`listBrands`** (Function) — `src/lib/services/brands.server.ts:7`
- **`requireAdminUser`** (Function) — `src/lib/server/auth-guards.ts:16`
- **`getAuthenticatedUserRole`** (Function) — `src/lib/server/auth-guards.ts:34`
- **`createUser`** (Function) — `src/routes/admin/users/+page.server.ts:40`

## Key Symbols

| Symbol                      | Type     | File                                            | Line |
| --------------------------- | -------- | ----------------------------------------------- | ---- |
| `load`                      | Function | `src/routes/+layout.server.ts`                  | 3    |
| `listBrands`                | Function | `src/lib/services/brands.server.ts`             | 7    |
| `requireAdminUser`          | Function | `src/lib/server/auth-guards.ts`                 | 16   |
| `getAuthenticatedUserRole`  | Function | `src/lib/server/auth-guards.ts`                 | 34   |
| `createUser`                | Function | `src/routes/admin/users/+page.server.ts`        | 40   |
| `updateUser`                | Function | `src/routes/admin/users/+page.server.ts`        | 72   |
| `load`                      | Function | `src/routes/admin/dim-offers/+page.server.ts`   | 35   |
| `GET`                       | Function | `src/routes/admin/dim-offers/export/+server.ts` | 53   |
| `pingClickHouse`            | Function | `src/lib/server/clickhouse.ts`                  | 141  |
| `isPublicPath`              | Function | `src/lib/server/auth-guards.ts`                 | 61   |
| `isAdminPath`               | Function | `src/lib/server/auth-guards.ts`                 | 65   |
| `isAdminRole`               | Function | `src/lib/auth/roles.ts`                         | 7    |
| `formatNumber`              | Function | `src/routes/admin/dim-offers/export/+server.ts` | 49   |
| `loadEnvFileValues`         | Function | `src/lib/server/clickhouse.ts`                  | 12   |
| `parseRequestTimeout`       | Function | `src/lib/server/clickhouse.ts`                  | 51   |
| `getRequiredEnv`            | Function | `src/lib/server/clickhouse.ts`                  | 61   |
| `getEnvValue`               | Function | `src/lib/server/clickhouse.ts`                  | 69   |
| `getClickHouseConfig`       | Function | `src/lib/server/clickhouse.ts`                  | 79   |
| `getClickHouseConfigKey`    | Function | `src/lib/server/clickhouse.ts`                  | 97   |
| `createClickHouseSingleton` | Function | `src/lib/server/clickhouse.ts`                  | 109  |

## Execution Flows

| Flow                                   | Type            | Steps |
| -------------------------------------- | --------------- | ----- |
| `PingClickHouse → LoadEnvFileValues`   | intra_community | 6     |
| `PingClickHouse → GetRequiredEnv`      | intra_community | 5     |
| `PingClickHouse → ParseRequestTimeout` | intra_community | 5     |
| `GET → GetSortExpression`              | cross_community | 4     |
| `Load → RequireAuthenticatedUser`      | cross_community | 3     |
| `Load → GetAuthenticatedUserRole`      | cross_community | 3     |
| `Load → IsAdminRole`                   | cross_community | 3     |
| `Load → RequireAuthenticatedUser`      | cross_community | 3     |
| `Load → GetAuthenticatedUserRole`      | intra_community | 3     |
| `Load → IsAdminRole`                   | cross_community | 3     |

## Connected Areas

| Area              | Connections |
| ----------------- | ----------- |
| Services          | 2 calls     |
| Aggregator-offers | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "load"})` — see callers and callees
2. `gitnexus_query({query: "server"})` — find related execution flows
3. Read key files listed above for implementation details
