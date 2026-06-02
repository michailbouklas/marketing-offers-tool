---
name: server
description: "Skill for the Server area of marketing-offers-tool. 85 symbols across 29 files."
---

# Server

85 symbols | 29 files | Cohesion: 78%

## When to Use

- Working with code in `src/`
- Understanding how getImageGeneratorEnv, hasImageRouterProvider, hasOpenAIProvider work
- Modifying server-related functionality

## Key Files

| File                                                          | Symbols                                                                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/lib/server/brand-storage.ts`                             | readBrandGuidelines, ensureSafeSlug, brandDir, brandGuidelinesPath, ensureBrandDir (+7)              |
| `src/lib/server/clickhouse.ts`                                | loadEnvFileValues, parseRequestTimeout, getRequiredEnv, getEnvValue, getClickHouseConfig (+5)        |
| `src/lib/server/env.ts`                                       | loadEnvFileValues, readEnv, loadImageGeneratorEnv, getImageGeneratorEnv, hasImageRouterProvider (+1) |
| `src/lib/server/auth-guards.ts`                               | requireAdminUser, getAuthenticatedUserRole, isPublicPath, isApiPath, isAdminPath                     |
| `src/lib/server/reference-storage.ts`                         | ensureSafeId, extensionForContentType, referenceFilePath, ensureReferencesDir, writeReferenceFile    |
| `src/lib/server/image-storage.ts`                             | ensureSafeId, imageFilePath, ensureImagesDir, writeImageBytes, readImageBytes                        |
| `src/lib/server/auth.ts`                                      | getRequiredEnv, getAuthConfig, getAuthConfigKey, createAuth, getAuth                                 |
| `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts` | parseBrandId, brandSlugOr404, GET, PUT                                                               |
| `src/lib/server/image-size.ts`                                | toPositiveInt, parseRequestedSize, squaredAspectRatioDelta, mapToNearestSupportedSize                |
| `src/lib/server/prisma.ts`                                    | getDatabaseUrl, createPrismaClient, hasDataQualityDelegates, getPrismaClient                         |

## Entry Points

Start here when exploring this area:

- **`getImageGeneratorEnv`** (Function) — `src/lib/server/env.ts:166`
- **`hasImageRouterProvider`** (Function) — `src/lib/server/env.ts:171`
- **`hasOpenAIProvider`** (Function) — `src/lib/server/env.ts:175`
- **`readBrandGuidelines`** (Function) — `src/lib/server/brand-storage.ts:131`
- **`listBrandAssets`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:19`

## Key Symbols

| Symbol                     | Type     | File                                                          | Line |
| -------------------------- | -------- | ------------------------------------------------------------- | ---- |
| `GenerateValidationError`  | Class    | `src/lib/services/image-generator/generate.server.ts`         | 39   |
| `getImageGeneratorEnv`     | Function | `src/lib/server/env.ts`                                       | 166  |
| `hasImageRouterProvider`   | Function | `src/lib/server/env.ts`                                       | 171  |
| `hasOpenAIProvider`        | Function | `src/lib/server/env.ts`                                       | 175  |
| `readBrandGuidelines`      | Function | `src/lib/server/brand-storage.ts`                             | 131  |
| `listBrandAssets`          | Function | `src/lib/services/brand-context/brand-context.server.ts`      | 19   |
| `getBrandGuidelines`       | Function | `src/lib/services/brand-context/brand-context.server.ts`      | 87   |
| `GET`                      | Function | `src/routes/api/brand-guidelines/+server.ts`                  | 7    |
| `GET`                      | Function | `src/routes/api/brand-assets/+server.ts`                      | 6    |
| `load`                     | Function | `src/routes/admin/brands/[id]/+page.server.ts`                | 10   |
| `GET`                      | Function | `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts` | 45   |
| `PUT`                      | Function | `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts` | 55   |
| `load`                     | Function | `src/routes/+layout.server.ts`                                | 3    |
| `listBrands`               | Function | `src/lib/services/brands.server.ts`                           | 7    |
| `requireAdminUser`         | Function | `src/lib/server/auth-guards.ts`                               | 27   |
| `getAuthenticatedUserRole` | Function | `src/lib/server/auth-guards.ts`                               | 45   |
| `load`                     | Function | `src/routes/admin/+page.server.ts`                            | 3    |
| `createUser`               | Function | `src/routes/admin/users/+page.server.ts`                      | 40   |
| `updateUser`               | Function | `src/routes/admin/users/+page.server.ts`                      | 72   |
| `load`                     | Function | `src/routes/admin/dim-offers/+page.server.ts`                 | 35   |

## Execution Flows

| Flow                                           | Type            | Steps |
| ---------------------------------------------- | --------------- | ----- |
| `Load → EnsureSafeSlug`                        | cross_community | 6     |
| `Load → LoadEnvFileValues`                     | cross_community | 6     |
| `GET → EnsureSafeSlug`                         | cross_community | 6     |
| `POST → LoadEnvFileValues`                     | cross_community | 6     |
| `GET → LoadEnvFileValues`                      | cross_community | 6     |
| `CreatePendingGenerations → LoadEnvFileValues` | cross_community | 6     |
| `PingClickHouse → LoadEnvFileValues`           | intra_community | 6     |
| `CreateBrandAsset → EnsureSafeSlug`            | cross_community | 6     |
| `GET → LoadEnvFileValues`                      | intra_community | 5     |
| `PUT → LoadEnvFileValues`                      | intra_community | 5     |

## Connected Areas

| Area              | Connections |
| ----------------- | ----------- |
| [id]              | 5 calls     |
| Services          | 3 calls     |
| Aggregator-offers | 2 calls     |

## How to Explore

1. `gitnexus_context({name: "getImageGeneratorEnv"})` — see callers and callees
2. `gitnexus_query({query: "server"})` — find related execution flows
3. Read key files listed above for implementation details
