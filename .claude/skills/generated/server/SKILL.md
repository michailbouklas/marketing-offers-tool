---
name: server
description: "Skill for the Server area of marketing-offers-tool. 94 symbols across 32 files."
---

# Server

94 symbols | 32 files | Cohesion: 69%

## When to Use

- Working with code in `src/`
- Understanding how getObjectStore, requireAuthenticatedApiUser, GET work
- Modifying server-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/server/object-store.server.ts` | ObjectStore, tryGet, LocalObjectStore, tryGet, SupabaseObjectStore (+12) |
| `src/lib/server/clickhouse.ts` | loadEnvFileValues, parseRequestTimeout, getRequiredEnv, getEnvValue, getClickHouseConfig (+5) |
| `src/lib/server/auth-guards.ts` | requireAuthenticatedApiUser, requireAdminSection, hasSuperUserRole, requireSuperUser, getAuthenticatedUserRole (+3) |
| `src/lib/server/env.ts` | loadEnvFileValues, readEnv, loadImageGeneratorEnv, getStorageEnv, hasSupabaseStorage (+3) |
| `src/lib/server/auth.ts` | getRequiredEnv, getAuthConfig, getAuthConfigKey, createAuth, getAuth |
| `src/lib/server/reference-storage.ts` | ensureSafeId, extensionForContentType, referenceKey, writeReferenceFile |
| `src/lib/server/image-size.ts` | toPositiveInt, parseRequestedSize, squaredAspectRatioDelta, mapToNearestSupportedSize |
| `src/lib/server/prisma.ts` | getDatabaseUrl, createPrismaClient, hasDataQualityDelegates, getPrismaClient |
| `src/lib/server/image-storage.ts` | ensureSafeId, imageKey, writeImageBytes, readImageBytes |
| `src/lib/server/brand-storage.ts` | ensureSafeSlug, ensureSafeAssetId, brandAssetKey, writeBrandAsset |

## Entry Points

Start here when exploring this area:

- **`getObjectStore`** (Function) — `src/lib/server/object-store.server.ts:278`
- **`requireAuthenticatedApiUser`** (Function) — `src/lib/server/auth-guards.ts:23`
- **`GET`** (Function) — `src/routes/api/brand-assets/+server.ts:8`
- **`GET`** (Function) — `src/routes/api/brand-guidelines/+server.ts:6`
- **`deletePreset`** (Function) — `src/lib/services/image-generator/composer-library.server.ts:140`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `LocalObjectStore` | Class | `src/lib/server/object-store.server.ts` | 70 |
| `SupabaseObjectStore` | Class | `src/lib/server/object-store.server.ts` | 157 |
| `getObjectStore` | Function | `src/lib/server/object-store.server.ts` | 278 |
| `requireAuthenticatedApiUser` | Function | `src/lib/server/auth-guards.ts` | 23 |
| `GET` | Function | `src/routes/api/brand-assets/+server.ts` | 8 |
| `GET` | Function | `src/routes/api/brand-guidelines/+server.ts` | 6 |
| `deletePreset` | Function | `src/lib/services/image-generator/composer-library.server.ts` | 140 |
| `deleteTemplate` | Function | `src/lib/services/image-generator/composer-library.server.ts` | 252 |
| `searchBrandAssets` | Function | `src/lib/services/brand-context/brand-context.server.ts` | 41 |
| `getBrandGuidelines` | Function | `src/lib/services/brand-context/brand-context.server.ts` | 130 |
| `inspirationImageKey` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 88 |
| `GET` | Function | `src/routes/api/brand-assets/[id]/+server.ts` | 6 |
| `GET` | Function | `src/routes/api/images/[id]/file/+server.ts` | 16 |
| `GET` | Function | `src/routes/api/images/references/[id]/+server.ts` | 6 |
| `DELETE` | Function | `src/routes/api/images/templates/[id]/+server.ts` | 28 |
| `DELETE` | Function | `src/routes/api/images/presets/[id]/+server.ts` | 28 |
| `GET` | Function | `src/routes/api/image-generator/inspiration/[slug]/[item]/image/+server.ts` | 16 |
| `load` | Function | `src/routes/+layout.server.ts` | 3 |
| `getUserSummaryById` | Function | `src/lib/services/users.server.ts` | 18 |
| `requireAdminSection` | Function | `src/lib/server/auth-guards.ts` | 59 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Load → LoadEnvFileValues` | cross_community | 6 |
| `GET → AssertSafeKey` | cross_community | 6 |
| `GET → LoadEnvFileValues` | cross_community | 6 |
| `PUT → AssertSafeKey` | cross_community | 6 |
| `PUT → From` | cross_community | 6 |
| `PUT → LoadEnvFileValues` | cross_community | 6 |
| `POST → AssertSafeKey` | cross_community | 6 |
| `POST → LoadEnvFileValues` | cross_community | 6 |
| `DELETE → LoadEnvFileValues` | cross_community | 6 |
| `Load → LoadEnvFileValues` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Inspiration | 8 calls |
| Services | 5 calls |
| Image-generator | 2 calls |

## How to Explore

1. `gitnexus_context({name: "getObjectStore"})` — see callers and callees
2. `gitnexus_query({query: "server"})` — find related execution flows
3. Read key files listed above for implementation details
