---
name: server
description: "Skill for the Server area of marketing-offers-tool. 98 symbols across 21 files."
---

# Server

98 symbols | 21 files | Cohesion: 73%

## When to Use

- Working with code in `src/`
- Understanding how readImageBytes, resizeToRequested, generateOneRow work
- Modifying server-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/server/object-store.server.ts` | get, get, get, tryGet, put (+22) |
| `src/lib/server/clickhouse.ts` | loadEnvFileValues, parseRequestTimeout, getRequiredEnv, getEnvValue, getClickHouseConfig (+5) |
| `src/lib/server/brand-storage.ts` | ensureSafeSlug, ensureSafeAssetId, brandAssetKey, writeBrandAsset, deleteBrandAsset (+3) |
| `src/lib/server/env.ts` | loadEnvFileValues, readEnv, loadImageGeneratorEnv, getImageGeneratorEnv, hasImageRouterProvider (+3) |
| `src/lib/server/image-size.ts` | resizeToRequested, toPositiveInt, parseRequestedSize, squaredAspectRatioDelta, mapToNearestSupportedSize |
| `src/lib/services/image-generator/orchestrate.server.ts` | withRetry, isImageQuality, isImageBackground, isInputFidelity, generateOneRow |
| `src/lib/server/auth-guards.ts` | requireAdminSection, getAuthenticatedUserRole, isPublicPath, isApiPath, isAdminPath |
| `src/lib/server/auth.ts` | getRequiredEnv, getAuthConfig, getAuthConfigKey, createAuth, getAuth |
| `src/lib/server/image-storage.ts` | readImageBytes, ensureSafeId, imageKey, writeImageBytes |
| `src/lib/server/reference-storage.ts` | ensureSafeId, extensionForContentType, referenceKey, writeReferenceFile |

## Entry Points

Start here when exploring this area:

- **`readImageBytes`** (Function) — `src/lib/server/image-storage.ts:38`
- **`resizeToRequested`** (Function) — `src/lib/server/image-size.ts:89`
- **`generateOneRow`** (Function) — `src/lib/services/image-generator/orchestrate.server.ts:47`
- **`pingClickHouse`** (Function) — `src/lib/server/clickhouse.ts:176`
- **`load`** (Function) — `src/routes/+layout.server.ts:3`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `LocalObjectStore` | Class | `src/lib/server/object-store.server.ts` | 52 |
| `SupabaseObjectStore` | Class | `src/lib/server/object-store.server.ts` | 122 |
| `readImageBytes` | Function | `src/lib/server/image-storage.ts` | 38 |
| `resizeToRequested` | Function | `src/lib/server/image-size.ts` | 89 |
| `generateOneRow` | Function | `src/lib/services/image-generator/orchestrate.server.ts` | 47 |
| `pingClickHouse` | Function | `src/lib/server/clickhouse.ts` | 176 |
| `load` | Function | `src/routes/+layout.server.ts` | 3 |
| `requireAdminSection` | Function | `src/lib/server/auth-guards.ts` | 54 |
| `getAuthenticatedUserRole` | Function | `src/lib/server/auth-guards.ts` | 151 |
| `isPublicPath` | Function | `src/lib/server/auth-guards.ts` | 178 |
| `isApiPath` | Function | `src/lib/server/auth-guards.ts` | 182 |
| `isAdminPath` | Function | `src/lib/server/auth-guards.ts` | 186 |
| `hasAnyRole` | Function | `src/lib/auth/roles.ts` | 80 |
| `canAccessAdminSection` | Function | `src/lib/auth/roles.ts` | 93 |
| `imageKey` | Function | `src/lib/server/image-storage.ts` | 17 |
| `writeImageBytes` | Function | `src/lib/server/image-storage.ts` | 26 |
| `brandAssetKey` | Function | `src/lib/server/brand-storage.ts` | 44 |
| `writeBrandAsset` | Function | `src/lib/server/brand-storage.ts` | 56 |
| `assertSafeKey` | Function | `src/lib/server/object-store.server.ts` | 35 |
| `deleteBrandAsset` | Function | `src/lib/server/brand-storage.ts` | 85 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `POST → LoadEnvFileValues` | cross_community | 7 |
| `Load → LoadEnvFileValues` | cross_community | 6 |
| `POST → AssertSafeKey` | cross_community | 6 |
| `POST → LoadEnvFileValues` | cross_community | 6 |
| `GET → AssertSafeKey` | cross_community | 6 |
| `GET → LoadEnvFileValues` | cross_community | 6 |
| `PUT → AssertSafeKey` | cross_community | 6 |
| `PUT → From` | cross_community | 6 |
| `PUT → LoadEnvFileValues` | cross_community | 6 |
| `DELETE → LoadEnvFileValues` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Image-providers | 3 calls |
| [id] | 3 calls |
| Brand-context | 2 calls |
| Services | 2 calls |
| Guidelines | 1 calls |

## How to Explore

1. `gitnexus_context({name: "readImageBytes"})` — see callers and callees
2. `gitnexus_query({query: "server"})` — find related execution flows
3. Read key files listed above for implementation details
