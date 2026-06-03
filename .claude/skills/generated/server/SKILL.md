---
name: server
description: "Skill for the Server area of marketing-offers-tool. 83 symbols across 24 files."
---

# Server

83 symbols | 24 files | Cohesion: 80%

## When to Use

- Working with code in `src/`
- Understanding how load, getImageGeneratorEnv, hasImageRouterProvider work
- Modifying server-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/server/brand-storage.ts` | ensureSafeSlug, brandDir, brandGuidelinesPath, ensureBrandDir, readBrandGuidelines (+7) |
| `src/lib/server/clickhouse.ts` | loadEnvFileValues, parseRequestTimeout, getRequiredEnv, getEnvValue, getClickHouseConfig (+5) |
| `src/lib/server/auth-guards.ts` | getAuthenticatedUserRole, isPublicPath, isApiPath, isAdminPath, requireAdminUser (+2) |
| `src/lib/server/env.ts` | loadEnvFileValues, readEnv, loadImageGeneratorEnv, getImageGeneratorEnv, hasImageRouterProvider (+1) |
| `src/lib/server/reference-storage.ts` | ensureSafeId, extensionForContentType, referenceFilePath, ensureReferencesDir, writeReferenceFile |
| `src/lib/server/image-storage.ts` | ensureSafeId, imageFilePath, ensureImagesDir, writeImageBytes, readImageBytes |
| `src/lib/server/auth.ts` | getRequiredEnv, getAuthConfig, getAuthConfigKey, createAuth, getAuth |
| `src/lib/services/image-generator/generate.server.ts` | GenerateValidationError, buildFinalPrompt, createPendingGenerations, resolveModelSize |
| `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts` | parseBrandId, brandSlugOr404, GET, PUT |
| `src/lib/server/image-size.ts` | toPositiveInt, parseRequestedSize, squaredAspectRatioDelta, mapToNearestSupportedSize |

## Entry Points

Start here when exploring this area:

- **`load`** (Function) — `src/routes/image-generator/+page.server.ts:5`
- **`getImageGeneratorEnv`** (Function) — `src/lib/server/env.ts:166`
- **`hasImageRouterProvider`** (Function) — `src/lib/server/env.ts:171`
- **`hasOpenAIProvider`** (Function) — `src/lib/server/env.ts:175`
- **`GET`** (Function) — `src/routes/api/brand-guidelines/+server.ts:7`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `GenerateValidationError` | Class | `src/lib/services/image-generator/generate.server.ts` | 77 |
| `load` | Function | `src/routes/image-generator/+page.server.ts` | 5 |
| `getImageGeneratorEnv` | Function | `src/lib/server/env.ts` | 166 |
| `hasImageRouterProvider` | Function | `src/lib/server/env.ts` | 171 |
| `hasOpenAIProvider` | Function | `src/lib/server/env.ts` | 175 |
| `GET` | Function | `src/routes/api/brand-guidelines/+server.ts` | 7 |
| `GET` | Function | `src/routes/api/brand-assets/+server.ts` | 6 |
| `buildFinalPrompt` | Function | `src/lib/services/image-generator/generate.server.ts` | 87 |
| `createPendingGenerations` | Function | `src/lib/services/image-generator/generate.server.ts` | 122 |
| `stringArray` | Function | `src/lib/services/image-providers/imagerouter-models.server.ts` | 27 |
| `toModelList` | Function | `src/lib/services/image-providers/imagerouter-models.server.ts` | 35 |
| `fetchImageRouterModelCaps` | Function | `src/lib/services/image-providers/imagerouter-models.server.ts` | 57 |
| `buildImageGeneratorConfig` | Function | `src/lib/services/image-providers/config.server.ts` | 66 |
| `listBrandAssets` | Function | `src/lib/services/brand-context/brand-context.server.ts` | 19 |
| `getBrandGuidelines` | Function | `src/lib/services/brand-context/brand-context.server.ts` | 87 |
| `load` | Function | `src/routes/admin/brands/[id]/+page.server.ts` | 10 |
| `GET` | Function | `src/routes/api/images/config/+server.ts` | 5 |
| `GET` | Function | `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts` | 45 |
| `PUT` | Function | `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts` | 55 |
| `pingClickHouse` | Function | `src/lib/server/clickhouse.ts` | 176 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Load → EnsureSafeSlug` | cross_community | 6 |
| `Load → LoadEnvFileValues` | intra_community | 6 |
| `GET → EnsureSafeSlug` | cross_community | 6 |
| `GET → LoadEnvFileValues` | intra_community | 6 |
| `CreatePendingGenerations → LoadEnvFileValues` | intra_community | 6 |
| `PingClickHouse → LoadEnvFileValues` | intra_community | 6 |
| `CreateBrandAsset → EnsureSafeSlug` | cross_community | 6 |
| `GET → LoadEnvFileValues` | intra_community | 5 |
| `PUT → LoadEnvFileValues` | intra_community | 5 |
| `POST → LoadEnvFileValues` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Services | 7 calls |
| [id] | 6 calls |
| Image-providers | 1 calls |
| Aggregator-offers | 1 calls |

## How to Explore

1. `gitnexus_context({name: "load"})` — see callers and callees
2. `gitnexus_query({query: "server"})` — find related execution flows
3. Read key files listed above for implementation details
