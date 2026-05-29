---
name: server
description: "Skill for the Server area of marketing-offers-tool. 75 symbols across 23 files."
---

# Server

75 symbols | 23 files | Cohesion: 80%

## When to Use

- Working with code in `src/`
- Understanding how extensionForContentType, referenceFilePath, writeReferenceFile work
- Modifying server-related functionality

## Key Files

| File                                                  | Symbols                                                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/lib/server/brand-storage.ts`                     | ensureSafeSlug, brandDir, brandGuidelinesPath, ensureBrandDir, readBrandGuidelines (+7)              |
| `src/lib/server/clickhouse.ts`                        | loadEnvFileValues, parseRequestTimeout, getRequiredEnv, getEnvValue, getClickHouseConfig (+5)        |
| `src/lib/server/env.ts`                               | loadEnvFileValues, readEnv, loadImageGeneratorEnv, getImageGeneratorEnv, hasImageRouterProvider (+1) |
| `src/lib/server/reference-storage.ts`                 | ensureSafeId, extensionForContentType, referenceFilePath, ensureReferencesDir, writeReferenceFile    |
| `src/lib/server/auth-guards.ts`                       | requireAdminUser, getAuthenticatedUserRole, isPublicPath, isApiPath, isAdminPath                     |
| `src/lib/server/image-storage.ts`                     | ensureSafeId, imageFilePath, ensureImagesDir, writeImageBytes, readImageBytes                        |
| `src/lib/server/auth.ts`                              | getRequiredEnv, getAuthConfig, getAuthConfigKey, createAuth, getAuth                                 |
| `src/lib/server/image-size.ts`                        | toPositiveInt, parseRequestedSize, squaredAspectRatioDelta, mapToNearestSupportedSize                |
| `src/lib/server/prisma.ts`                            | getDatabaseUrl, createPrismaClient, hasDataQualityDelegates, getPrismaClient                         |
| `src/lib/services/image-generator/generate.server.ts` | GenerateValidationError, buildFinalPrompt, createPendingGenerations                                  |

## Entry Points

Start here when exploring this area:

- **`extensionForContentType`** (Function) — `src/lib/server/reference-storage.ts:30`
- **`referenceFilePath`** (Function) — `src/lib/server/reference-storage.ts:38`
- **`writeReferenceFile`** (Function) — `src/lib/server/reference-storage.ts:53`
- **`getImageGeneratorEnv`** (Function) — `src/lib/server/env.ts:166`
- **`hasImageRouterProvider`** (Function) — `src/lib/server/env.ts:171`

## Key Symbols

| Symbol                     | Type     | File                                                           | Line |
| -------------------------- | -------- | -------------------------------------------------------------- | ---- |
| `GenerateValidationError`  | Class    | `src/lib/services/image-generator/generate.server.ts`          | 39   |
| `extensionForContentType`  | Function | `src/lib/server/reference-storage.ts`                          | 30   |
| `referenceFilePath`        | Function | `src/lib/server/reference-storage.ts`                          | 38   |
| `writeReferenceFile`       | Function | `src/lib/server/reference-storage.ts`                          | 53   |
| `getImageGeneratorEnv`     | Function | `src/lib/server/env.ts`                                        | 166  |
| `hasImageRouterProvider`   | Function | `src/lib/server/env.ts`                                        | 171  |
| `hasOpenAIProvider`        | Function | `src/lib/server/env.ts`                                        | 175  |
| `createBrandAsset`         | Function | `src/lib/services/brand-context/brand-context.server.ts`       | 47   |
| `POST`                     | Function | `src/routes/api/images/references/+server.ts`                  | 11   |
| `POST`                     | Function | `src/routes/api/images/references/from-brand-asset/+server.ts` | 18   |
| `POST`                     | Function | `src/routes/api/admin/brands/[brandId]/assets/+server.ts`      | 42   |
| `load`                     | Function | `src/routes/+layout.server.ts`                                 | 3    |
| `load`                     | Function | `src/routes/admin/+page.server.ts`                             | 3    |
| `listBrands`               | Function | `src/lib/services/brands.server.ts`                            | 7    |
| `requireAdminUser`         | Function | `src/lib/server/auth-guards.ts`                                | 27   |
| `getAuthenticatedUserRole` | Function | `src/lib/server/auth-guards.ts`                                | 45   |
| `createUser`               | Function | `src/routes/admin/users/+page.server.ts`                       | 40   |
| `updateUser`               | Function | `src/routes/admin/users/+page.server.ts`                       | 72   |
| `load`                     | Function | `src/routes/admin/brands/+page.server.ts`                      | 5    |
| `load`                     | Function | `src/routes/admin/dim-offers/+page.server.ts`                  | 35   |

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
| `POST → LoadEnvFileValues`                     | intra_community | 5     |
| `GET → LoadEnvFileValues`                      | cross_community | 5     |

## Connected Areas

| Area              | Connections |
| ----------------- | ----------- |
| [id]              | 3 calls     |
| Services          | 2 calls     |
| Aggregator-offers | 1 calls     |
| Guidelines        | 1 calls     |
| Assets            | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "extensionForContentType"})` — see callers and callees
2. `gitnexus_query({query: "server"})` — find related execution flows
3. Read key files listed above for implementation details
