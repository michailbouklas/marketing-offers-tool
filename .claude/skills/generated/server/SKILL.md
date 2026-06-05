---
name: server
description: "Skill for the Server area of marketing-offers-tool. 141 symbols across 44 files."
---

# Server

141 symbols | 44 files | Cohesion: 70%

## When to Use

- Working with code in `src/`
- Understanding how assertSafeKey, brandGuidelinesKey, readBrandGuidelines work
- Modifying server-related functionality

## Key Files

| File                                                       | Symbols                                                                                               |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/lib/server/object-store.server.ts`                    | getText, putText, list, assertSafeKey, toPath (+24)                                                   |
| `src/lib/server/inspiration/inspiration-storage.server.ts` | slugify, categoryMetaKey, ensureRoot, nextFreeSlug, listCategories (+8)                               |
| `src/lib/server/clickhouse.ts`                             | loadEnvFileValues, parseRequestTimeout, getRequiredEnv, getEnvValue, getClickHouseConfig (+5)         |
| `src/lib/server/auth-guards.ts`                            | requirePermission, requireAuthenticatedApiUser, isPublicPath, isApiPath, isAdminPath (+4)             |
| `src/lib/server/env.ts`                                    | loadEnvFileValues, readEnv, loadImageGeneratorEnv, getStorageEnv, hasSupabaseStorage (+3)             |
| `src/lib/server/brand-storage.ts`                          | brandGuidelinesKey, readBrandGuidelines, writeBrandGuidelines, ensureSafeSlug, ensureSafeAssetId (+2) |
| `src/lib/server/auth.ts`                                   | getRequiredEnv, getAuthConfig, getAuthConfigKey, createAuth, getAuth                                  |
| `src/lib/server/reference-storage.ts`                      | ensureSafeId, extensionForContentType, referenceKey, writeReferenceFile                               |
| `src/lib/server/image-storage.ts`                          | ensureSafeId, imageKey, readImageBytes, writeImageBytes                                               |
| `src/lib/server/image-size.ts`                             | toPositiveInt, parseRequestedSize, squaredAspectRatioDelta, mapToNearestSupportedSize                 |

## Entry Points

Start here when exploring this area:

- **`assertSafeKey`** (Function) — `src/lib/server/object-store.server.ts:53`
- **`brandGuidelinesKey`** (Function) — `src/lib/server/brand-storage.ts:52`
- **`readBrandGuidelines`** (Function) — `src/lib/server/brand-storage.ts:94`
- **`writeBrandGuidelines`** (Function) — `src/lib/server/brand-storage.ts:101`
- **`slugify`** (Function) — `src/lib/server/inspiration/inspiration-storage.server.ts:61`

## Key Symbols

| Symbol                      | Type     | File                                                            | Line |
| --------------------------- | -------- | --------------------------------------------------------------- | ---- |
| `LocalObjectStore`          | Class    | `src/lib/server/object-store.server.ts`                         | 70   |
| `SupabaseObjectStore`       | Class    | `src/lib/server/object-store.server.ts`                         | 157  |
| `StructuredPromptSuggester` | Class    | `src/lib/services/image-providers/structured-prompt.server.ts`  | 90   |
| `assertSafeKey`             | Function | `src/lib/server/object-store.server.ts`                         | 53   |
| `brandGuidelinesKey`        | Function | `src/lib/server/brand-storage.ts`                               | 52   |
| `readBrandGuidelines`       | Function | `src/lib/server/brand-storage.ts`                               | 94   |
| `writeBrandGuidelines`      | Function | `src/lib/server/brand-storage.ts`                               | 101  |
| `slugify`                   | Function | `src/lib/server/inspiration/inspiration-storage.server.ts`      | 61   |
| `listCategories`            | Function | `src/lib/server/inspiration/inspiration-storage.server.ts`      | 120  |
| `getCategory`               | Function | `src/lib/server/inspiration/inspiration-storage.server.ts`      | 134  |
| `createCategory`            | Function | `src/lib/server/inspiration/inspiration-storage.server.ts`      | 161  |
| `renameCategory`            | Function | `src/lib/server/inspiration/inspiration-storage.server.ts`      | 180  |
| `listItems`                 | Function | `src/lib/server/inspiration/inspiration-storage.server.ts`      | 229  |
| `createItem`                | Function | `src/lib/server/inspiration/inspiration-storage.server.ts`      | 285  |
| `serializeFrontmatter`      | Function | `src/lib/server/inspiration/frontmatter.ts`                     | 17   |
| `parseFrontmatter`          | Function | `src/lib/server/inspiration/frontmatter.ts`                     | 32   |
| `load`                      | Function | `src/routes/image-generator/inspiration/[slug]/+page.server.ts` | 9    |
| `POST`                      | Function | `src/routes/api/admin/prompt-gallery/[slug]/items/+server.ts`   | 10   |
| `createOffer`               | Function | `src/routes/aggregator-offers/+page.server.ts`                  | 68   |
| `updateOffer`               | Function | `src/routes/aggregator-offers/+page.server.ts`                  | 92   |

## Execution Flows

| Flow                         | Type            | Steps |
| ---------------------------- | --------------- | ----- |
| `POST → LoadEnvFileValues`   | cross_community | 7     |
| `Load → LoadEnvFileValues`   | cross_community | 6     |
| `GET → AssertSafeKey`        | cross_community | 6     |
| `GET → LoadEnvFileValues`    | cross_community | 6     |
| `PUT → AssertSafeKey`        | cross_community | 6     |
| `PUT → From`                 | cross_community | 6     |
| `PUT → LoadEnvFileValues`    | cross_community | 6     |
| `POST → AssertSafeKey`       | cross_community | 6     |
| `POST → LoadEnvFileValues`   | cross_community | 6     |
| `DELETE → LoadEnvFileValues` | cross_community | 6     |

## Connected Areas

| Area            | Connections |
| --------------- | ----------- |
| Services        | 10 calls    |
| Inspiration     | 10 calls    |
| Image-providers | 1 calls     |
| Image-generator | 1 calls     |
| Guidelines      | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "assertSafeKey"})` — see callers and callees
2. `gitnexus_query({query: "server"})` — find related execution flows
3. Read key files listed above for implementation details
