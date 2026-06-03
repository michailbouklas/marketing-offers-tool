---
name: server
description: "Skill for the Server area of marketing-offers-tool. 100 symbols across 23 files."
---

# Server

100 symbols | 23 files | Cohesion: 73%

## When to Use

- Working with code in `src/`
- Understanding how assertSafeKey, deleteBrandAsset, readBrandGuidelines work
- Modifying server-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/server/object-store.server.ts` | getText, assertSafeKey, toPath, getText, remove (+22) |
| `src/lib/server/clickhouse.ts` | loadEnvFileValues, parseRequestTimeout, getRequiredEnv, getEnvValue, getClickHouseConfig (+5) |
| `src/lib/server/brand-storage.ts` | deleteBrandAsset, readBrandGuidelines, ensureSafeSlug, ensureSafeAssetId, brandAssetKey (+3) |
| `src/lib/server/env.ts` | loadEnvFileValues, readEnv, loadImageGeneratorEnv, getImageGeneratorEnv, hasImageRouterProvider (+3) |
| `src/lib/server/auth-guards.ts` | requireAuthenticatedApiUser, isPublicPath, isApiPath, isAdminPath, requireAdminUser (+1) |
| `src/lib/server/image-size.ts` | resizeToRequested, toPositiveInt, parseRequestedSize, squaredAspectRatioDelta, mapToNearestSupportedSize |
| `src/lib/services/image-generator/orchestrate.server.ts` | withRetry, isImageQuality, isImageBackground, isInputFidelity, generateOneRow |
| `src/lib/server/auth.ts` | getRequiredEnv, getAuthConfig, getAuthConfigKey, createAuth, getAuth |
| `src/lib/server/image-storage.ts` | readImageBytes, ensureSafeId, imageKey, writeImageBytes |
| `src/lib/server/reference-storage.ts` | ensureSafeId, extensionForContentType, referenceKey, writeReferenceFile |

## Entry Points

Start here when exploring this area:

- **`assertSafeKey`** (Function) — `src/lib/server/object-store.server.ts:35`
- **`deleteBrandAsset`** (Function) — `src/lib/server/brand-storage.ts:85`
- **`readBrandGuidelines`** (Function) — `src/lib/server/brand-storage.ts:94`
- **`readImageBytes`** (Function) — `src/lib/server/image-storage.ts:38`
- **`resizeToRequested`** (Function) — `src/lib/server/image-size.ts:89`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `LocalObjectStore` | Class | `src/lib/server/object-store.server.ts` | 52 |
| `SupabaseObjectStore` | Class | `src/lib/server/object-store.server.ts` | 122 |
| `assertSafeKey` | Function | `src/lib/server/object-store.server.ts` | 35 |
| `deleteBrandAsset` | Function | `src/lib/server/brand-storage.ts` | 85 |
| `readBrandGuidelines` | Function | `src/lib/server/brand-storage.ts` | 94 |
| `readImageBytes` | Function | `src/lib/server/image-storage.ts` | 38 |
| `resizeToRequested` | Function | `src/lib/server/image-size.ts` | 89 |
| `generateOneRow` | Function | `src/lib/services/image-generator/orchestrate.server.ts` | 47 |
| `pingClickHouse` | Function | `src/lib/server/clickhouse.ts` | 176 |
| `imageKey` | Function | `src/lib/server/image-storage.ts` | 17 |
| `writeImageBytes` | Function | `src/lib/server/image-storage.ts` | 26 |
| `brandAssetKey` | Function | `src/lib/server/brand-storage.ts` | 44 |
| `writeBrandAsset` | Function | `src/lib/server/brand-storage.ts` | 56 |
| `requireAuthenticatedApiUser` | Function | `src/lib/server/auth-guards.ts` | 18 |
| `getGeneratedImageUsageByDayForUser` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 301 |
| `GET` | Function | `src/routes/api/images/usage/+server.ts` | 5 |
| `GET` | Function | `src/routes/api/brand-assets/[id]/+server.ts` | 6 |
| `GET` | Function | `src/routes/api/images/[id]/file/+server.ts` | 13 |
| `GET` | Function | `src/routes/api/images/references/[id]/+server.ts` | 6 |
| `getImageGeneratorEnv` | Function | `src/lib/server/env.ts` | 166 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `POST → LoadEnvFileValues` | cross_community | 7 |
| `POST → AssertSafeKey` | cross_community | 6 |
| `GET → AssertSafeKey` | cross_community | 6 |
| `PUT → AssertSafeKey` | cross_community | 6 |
| `PUT → From` | cross_community | 6 |
| `DELETE → LoadEnvFileValues` | cross_community | 6 |
| `Load → LoadEnvFileValues` | cross_community | 6 |
| `POST → AssertSafeKey` | cross_community | 6 |
| `POST → From` | cross_community | 6 |
| `Load → AssertSafeKey` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Services | 4 calls |
| Image-providers | 3 calls |
| Brand-context | 1 calls |
| Image-generator | 1 calls |

## How to Explore

1. `gitnexus_context({name: "assertSafeKey"})` — see callers and callees
2. `gitnexus_query({query: "server"})` — find related execution flows
3. Read key files listed above for implementation details
