---
name: server
description: "Skill for the Server area of marketing-offers-tool. 100 symbols across 21 files."
---

# Server

100 symbols | 21 files | Cohesion: 71%

## When to Use

- Working with code in `src/`
- Understanding how readImageBytes, resizeToRequested, generateOneRow work
- Modifying server-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/server/object-store.server.ts` | get, get, get, tryGet, assertSafeKey (+21) |
| `src/lib/server/clickhouse.ts` | loadEnvFileValues, parseRequestTimeout, getRequiredEnv, getEnvValue, getClickHouseConfig (+5) |
| `src/lib/server/brand-storage.ts` | deleteBrandAsset, ensureSafeSlug, ensureSafeAssetId, brandAssetKey, writeBrandAsset (+3) |
| `src/lib/server/env.ts` | loadEnvFileValues, readEnv, loadImageGeneratorEnv, getImageGeneratorEnv, hasImageRouterProvider (+3) |
| `src/lib/server/auth-guards.ts` | requireAdminSection, hasPermission, isPublicPath, isApiPath, isAdminPath (+2) |
| `src/lib/server/image-size.ts` | resizeToRequested, toPositiveInt, parseRequestedSize, squaredAspectRatioDelta, mapToNearestSupportedSize |
| `src/lib/services/image-generator/orchestrate.server.ts` | withRetry, isImageQuality, isImageBackground, isInputFidelity, generateOneRow |
| `src/lib/server/auth.ts` | getRequiredEnv, getAuthConfig, getAuthConfigKey, createAuth, getAuth |
| `src/lib/server/image-storage.ts` | readImageBytes, ensureSafeId, imageKey, writeImageBytes |
| `src/lib/server/reference-storage.ts` | ensureSafeId, extensionForContentType, referenceKey, writeReferenceFile |

## Entry Points

Start here when exploring this area:

- **`readImageBytes`** (Function) — `src/lib/server/image-storage.ts:38`
- **`resizeToRequested`** (Function) — `src/lib/server/image-size.ts:89`
- **`generateOneRow`** (Function) — `src/lib/services/image-generator/orchestrate.server.ts:47`
- **`assertSafeKey`** (Function) — `src/lib/server/object-store.server.ts:35`
- **`deleteBrandAsset`** (Function) — `src/lib/server/brand-storage.ts:85`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `LocalObjectStore` | Class | `src/lib/server/object-store.server.ts` | 52 |
| `SupabaseObjectStore` | Class | `src/lib/server/object-store.server.ts` | 122 |
| `readImageBytes` | Function | `src/lib/server/image-storage.ts` | 38 |
| `resizeToRequested` | Function | `src/lib/server/image-size.ts` | 89 |
| `generateOneRow` | Function | `src/lib/services/image-generator/orchestrate.server.ts` | 47 |
| `assertSafeKey` | Function | `src/lib/server/object-store.server.ts` | 35 |
| `deleteBrandAsset` | Function | `src/lib/server/brand-storage.ts` | 85 |
| `pingClickHouse` | Function | `src/lib/server/clickhouse.ts` | 176 |
| `imageKey` | Function | `src/lib/server/image-storage.ts` | 17 |
| `writeImageBytes` | Function | `src/lib/server/image-storage.ts` | 26 |
| `brandAssetKey` | Function | `src/lib/server/brand-storage.ts` | 44 |
| `writeBrandAsset` | Function | `src/lib/server/brand-storage.ts` | 56 |
| `extensionForContentType` | Function | `src/lib/server/reference-storage.ts` | 31 |
| `referenceKey` | Function | `src/lib/server/reference-storage.ts` | 40 |
| `writeReferenceFile` | Function | `src/lib/server/reference-storage.ts` | 44 |
| `POST` | Function | `src/routes/api/images/references/+server.ts` | 11 |
| `POST` | Function | `src/routes/api/images/references/from-brand-asset/+server.ts` | 16 |
| `POST` | Function | `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | 41 |
| `getImageGeneratorEnv` | Function | `src/lib/server/env.ts` | 166 |
| `hasImageRouterProvider` | Function | `src/lib/server/env.ts` | 171 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `POST → LoadEnvFileValues` | cross_community | 7 |
| `Load → LoadEnvFileValues` | cross_community | 6 |
| `GET → AssertSafeKey` | cross_community | 6 |
| `GET → LoadEnvFileValues` | cross_community | 6 |
| `PUT → AssertSafeKey` | cross_community | 6 |
| `PUT → From` | cross_community | 6 |
| `PUT → LoadEnvFileValues` | cross_community | 6 |
| `POST → AssertSafeKey` | cross_community | 6 |
| `POST → LoadEnvFileValues` | cross_community | 6 |
| `DELETE → LoadEnvFileValues` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Services | 4 calls |
| Image-providers | 3 calls |
| Brand-context | 2 calls |
| [id] | 2 calls |
| Guidelines | 1 calls |

## How to Explore

1. `gitnexus_context({name: "readImageBytes"})` — see callers and callees
2. `gitnexus_query({query: "server"})` — find related execution flows
3. Read key files listed above for implementation details
