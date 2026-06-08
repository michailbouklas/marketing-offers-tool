---
name: server
description: "Skill for the Server area of marketing-offers-tool. 118 symbols across 36 files."
---

# Server

118 symbols | 36 files | Cohesion: 65%

## When to Use

- Working with code in `src/`
- Understanding how requireAuthenticatedApiUser, hasSuperUserRole, GET work
- Modifying server-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/server/object-store.server.ts` | tryGet, tryGet, getText, putText, toPath (+21) |
| `src/lib/server/clickhouse.ts` | loadEnvFileValues, parseRequestTimeout, getRequiredEnv, getEnvValue, getClickHouseConfig (+5) |
| `src/lib/server/auth-guards.ts` | requireAuthenticatedApiUser, hasSuperUserRole, isPublicPath, isApiPath, isAdminPath (+4) |
| `src/lib/server/env.ts` | loadEnvFileValues, readEnv, loadImageGeneratorEnv, getStorageEnv, hasSupabaseStorage (+3) |
| `src/lib/server/brand-storage.ts` | brandGuidelinesKey, readBrandGuidelines, writeBrandGuidelines, ensureSafeSlug, ensureSafeAssetId (+2) |
| `src/lib/server/inspiration/inspiration-storage.server.ts` | slugify, ensureRoot, nextFreeSlug, createCategory, renameCategory (+2) |
| `src/lib/server/auth.ts` | getRequiredEnv, getAuthConfig, getAuthConfigKey, createAuth, getAuth |
| `src/lib/server/reference-storage.ts` | ensureSafeId, extensionForContentType, referenceKey, writeReferenceFile |
| `src/lib/server/image-storage.ts` | ensureSafeId, imageKey, readImageBytes, writeImageBytes |
| `src/lib/server/image-size.ts` | toPositiveInt, parseRequestedSize, squaredAspectRatioDelta, mapToNearestSupportedSize |

## Entry Points

Start here when exploring this area:

- **`requireAuthenticatedApiUser`** (Function) — `src/lib/server/auth-guards.ts:23`
- **`hasSuperUserRole`** (Function) — `src/lib/server/auth-guards.ts:82`
- **`GET`** (Function) — `src/routes/api/brand-assets/+server.ts:8`
- **`getGeneratedImageUsageByDayForUser`** (Function) — `src/lib/services/image-generator/image-generator.server.ts:308`
- **`deletePreset`** (Function) — `src/lib/services/image-generator/composer-library.server.ts:140`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `LocalObjectStore` | Class | `src/lib/server/object-store.server.ts` | 70 |
| `SupabaseObjectStore` | Class | `src/lib/server/object-store.server.ts` | 157 |
| `requireAuthenticatedApiUser` | Function | `src/lib/server/auth-guards.ts` | 23 |
| `hasSuperUserRole` | Function | `src/lib/server/auth-guards.ts` | 82 |
| `GET` | Function | `src/routes/api/brand-assets/+server.ts` | 8 |
| `getGeneratedImageUsageByDayForUser` | Function | `src/lib/services/image-generator/image-generator.server.ts` | 308 |
| `deletePreset` | Function | `src/lib/services/image-generator/composer-library.server.ts` | 140 |
| `deleteTemplate` | Function | `src/lib/services/image-generator/composer-library.server.ts` | 252 |
| `searchBrandAssets` | Function | `src/lib/services/brand-context/brand-context.server.ts` | 41 |
| `GET` | Function | `src/routes/api/images/usage/+server.ts` | 8 |
| `GET` | Function | `src/routes/api/brand-assets/[id]/+server.ts` | 6 |
| `GET` | Function | `src/routes/api/images/[id]/file/+server.ts` | 16 |
| `GET` | Function | `src/routes/api/images/references/[id]/+server.ts` | 6 |
| `DELETE` | Function | `src/routes/api/images/templates/[id]/+server.ts` | 28 |
| `DELETE` | Function | `src/routes/api/images/presets/[id]/+server.ts` | 28 |
| `GET` | Function | `src/routes/api/image-generator/inspiration/[slug]/[item]/image/+server.ts` | 16 |
| `brandGuidelinesKey` | Function | `src/lib/server/brand-storage.ts` | 52 |
| `readBrandGuidelines` | Function | `src/lib/server/brand-storage.ts` | 94 |
| `writeBrandGuidelines` | Function | `src/lib/server/brand-storage.ts` | 101 |
| `slugify` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 61 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Load → LoadEnvFileValues` | cross_community | 6 |
| `POST → AssertSafeKey` | cross_community | 6 |
| `POST → LoadEnvFileValues` | cross_community | 6 |
| `GET → AssertSafeKey` | cross_community | 6 |
| `GET → LoadEnvFileValues` | cross_community | 6 |
| `PUT → AssertSafeKey` | cross_community | 6 |
| `PUT → From` | cross_community | 6 |
| `PUT → LoadEnvFileValues` | cross_community | 6 |
| `DELETE → LoadEnvFileValues` | cross_community | 6 |
| `Load → LoadEnvFileValues` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Services | 12 calls |
| Inspiration | 11 calls |
| Image-generator | 1 calls |
| Guidelines | 1 calls |

## How to Explore

1. `gitnexus_context({name: "requireAuthenticatedApiUser"})` — see callers and callees
2. `gitnexus_query({query: "server"})` — find related execution flows
3. Read key files listed above for implementation details
