---
name: server
description: "Skill for the Server area of marketing-offers-tool. 71 symbols across 19 files."
---

# Server

71 symbols | 19 files | Cohesion: 82%

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
| `src/lib/server/reference-storage.ts`                         | ensureSafeId, extensionForContentType, referenceFilePath, ensureReferencesDir, writeReferenceFile    |
| `src/lib/server/image-storage.ts`                             | ensureSafeId, imageFilePath, ensureImagesDir, writeImageBytes, readImageBytes                        |
| `src/lib/server/auth.ts`                                      | getRequiredEnv, getAuthConfig, getAuthConfigKey, createAuth, getAuth                                 |
| `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts` | parseBrandId, brandSlugOr404, GET, PUT                                                               |
| `src/lib/server/image-size.ts`                                | toPositiveInt, parseRequestedSize, squaredAspectRatioDelta, mapToNearestSupportedSize                |
| `src/lib/server/prisma.ts`                                    | getDatabaseUrl, createPrismaClient, hasDataQualityDelegates, getPrismaClient                         |
| `src/lib/services/brand-context/brand-context.server.ts`      | listBrandAssets, getBrandGuidelines, setBrandGuidelines                                              |

## Entry Points

Start here when exploring this area:

- **`getImageGeneratorEnv`** (Function) — `src/lib/server/env.ts:166`
- **`hasImageRouterProvider`** (Function) — `src/lib/server/env.ts:171`
- **`hasOpenAIProvider`** (Function) — `src/lib/server/env.ts:175`
- **`readBrandGuidelines`** (Function) — `src/lib/server/brand-storage.ts:131`
- **`GET`** (Function) — `src/routes/api/brand-guidelines/+server.ts:7`

## Key Symbols

| Symbol                      | Type     | File                                                           | Line |
| --------------------------- | -------- | -------------------------------------------------------------- | ---- |
| `GenerateValidationError`   | Class    | `src/lib/services/image-generator/generate.server.ts`          | 39   |
| `getImageGeneratorEnv`      | Function | `src/lib/server/env.ts`                                        | 166  |
| `hasImageRouterProvider`    | Function | `src/lib/server/env.ts`                                        | 171  |
| `hasOpenAIProvider`         | Function | `src/lib/server/env.ts`                                        | 175  |
| `readBrandGuidelines`       | Function | `src/lib/server/brand-storage.ts`                              | 131  |
| `GET`                       | Function | `src/routes/api/brand-guidelines/+server.ts`                   | 7    |
| `GET`                       | Function | `src/routes/api/brand-assets/+server.ts`                       | 6    |
| `listBrandAssets`           | Function | `src/lib/services/brand-context/brand-context.server.ts`       | 19   |
| `getBrandGuidelines`        | Function | `src/lib/services/brand-context/brand-context.server.ts`       | 87   |
| `load`                      | Function | `src/routes/admin/brands/[id]/+page.server.ts`                 | 10   |
| `GET`                       | Function | `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts`  | 45   |
| `PUT`                       | Function | `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts`  | 55   |
| `pingClickHouse`            | Function | `src/lib/server/clickhouse.ts`                                 | 176  |
| `extensionForContentType`   | Function | `src/lib/server/reference-storage.ts`                          | 30   |
| `referenceFilePath`         | Function | `src/lib/server/reference-storage.ts`                          | 38   |
| `writeReferenceFile`        | Function | `src/lib/server/reference-storage.ts`                          | 53   |
| `POST`                      | Function | `src/routes/api/images/references/+server.ts`                  | 11   |
| `POST`                      | Function | `src/routes/api/images/references/from-brand-asset/+server.ts` | 18   |
| `parseRequestedSize`        | Function | `src/lib/server/image-size.ts`                                 | 26   |
| `mapToNearestSupportedSize` | Function | `src/lib/server/image-size.ts`                                 | 61   |

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
| `POST → LoadEnvFileValues`                     | cross_community | 5     |
| `GET → LoadEnvFileValues`                      | intra_community | 5     |

## Connected Areas

| Area   | Connections |
| ------ | ----------- |
| [id]   | 5 calls     |
| Routes | 4 calls     |

## How to Explore

1. `gitnexus_context({name: "getImageGeneratorEnv"})` — see callers and callees
2. `gitnexus_query({query: "server"})` — find related execution flows
3. Read key files listed above for implementation details
