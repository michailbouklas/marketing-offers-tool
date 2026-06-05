---
name: server
description: "Skill for the Server area of marketing-offers-tool. 101 symbols across 25 files."
---

# Server

101 symbols | 25 files | Cohesion: 69%

## When to Use

- Working with code in `src/`
- Understanding how brandGuidelinesKey, readBrandGuidelines, writeBrandGuidelines work
- Modifying server-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/server/object-store.server.ts` | getText, putText, toPath, getText, putText (+19) |
| `src/lib/server/clickhouse.ts` | loadEnvFileValues, parseRequestTimeout, getRequiredEnv, getEnvValue, getClickHouseConfig (+5) |
| `src/lib/server/env.ts` | loadEnvFileValues, readEnv, loadImageGeneratorEnv, getStorageEnv, hasSupabaseStorage (+3) |
| `src/lib/server/brand-storage.ts` | brandGuidelinesKey, readBrandGuidelines, writeBrandGuidelines, ensureSafeSlug, ensureSafeAssetId (+2) |
| `src/lib/server/inspiration/inspiration-storage.server.ts` | slugify, ensureRoot, nextFreeSlug, createCategory, renameCategory (+2) |
| `src/lib/server/auth-guards.ts` | requireAdminSection, hasSuperUserRole, requireSuperUser, getAuthenticatedUserRole, isPublicPath (+2) |
| `src/lib/server/auth.ts` | getRequiredEnv, getAuthConfig, getAuthConfigKey, createAuth, getAuth |
| `src/lib/server/reference-storage.ts` | ensureSafeId, extensionForContentType, referenceKey, writeReferenceFile |
| `src/lib/server/image-storage.ts` | ensureSafeId, imageKey, readImageBytes, writeImageBytes |
| `src/lib/server/image-size.ts` | toPositiveInt, parseRequestedSize, squaredAspectRatioDelta, mapToNearestSupportedSize |

## Entry Points

Start here when exploring this area:

- **`brandGuidelinesKey`** (Function) — `src/lib/server/brand-storage.ts:52`
- **`readBrandGuidelines`** (Function) — `src/lib/server/brand-storage.ts:94`
- **`writeBrandGuidelines`** (Function) — `src/lib/server/brand-storage.ts:101`
- **`slugify`** (Function) — `src/lib/server/inspiration/inspiration-storage.server.ts:61`
- **`createCategory`** (Function) — `src/lib/server/inspiration/inspiration-storage.server.ts:161`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `LocalObjectStore` | Class | `src/lib/server/object-store.server.ts` | 70 |
| `SupabaseObjectStore` | Class | `src/lib/server/object-store.server.ts` | 157 |
| `brandGuidelinesKey` | Function | `src/lib/server/brand-storage.ts` | 52 |
| `readBrandGuidelines` | Function | `src/lib/server/brand-storage.ts` | 94 |
| `writeBrandGuidelines` | Function | `src/lib/server/brand-storage.ts` | 101 |
| `slugify` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 61 |
| `createCategory` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 161 |
| `renameCategory` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 180 |
| `createItem` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 285 |
| `serializeFrontmatter` | Function | `src/lib/server/inspiration/frontmatter.ts` | 17 |
| `load` | Function | `src/routes/+layout.server.ts` | 3 |
| `getUserSummaryById` | Function | `src/lib/services/users.server.ts` | 18 |
| `requireAdminSection` | Function | `src/lib/server/auth-guards.ts` | 59 |
| `hasSuperUserRole` | Function | `src/lib/server/auth-guards.ts` | 82 |
| `requireSuperUser` | Function | `src/lib/server/auth-guards.ts` | 89 |
| `getAuthenticatedUserRole` | Function | `src/lib/server/auth-guards.ts` | 186 |
| `isPublicPath` | Function | `src/lib/server/auth-guards.ts` | 213 |
| `isApiPath` | Function | `src/lib/server/auth-guards.ts` | 217 |
| `isAdminPath` | Function | `src/lib/server/auth-guards.ts` | 221 |
| `hasAnyRole` | Function | `src/lib/auth/roles.ts` | 91 |

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
| Services | 9 calls |
| Inspiration | 8 calls |
| [id] | 3 calls |
| Image-generator | 2 calls |
| Assets | 1 calls |

## How to Explore

1. `gitnexus_context({name: "brandGuidelinesKey"})` — see callers and callees
2. `gitnexus_query({query: "server"})` — find related execution flows
3. Read key files listed above for implementation details
