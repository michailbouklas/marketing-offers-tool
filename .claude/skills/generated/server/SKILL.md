---
name: server
description: "Skill for the Server area of marketing-offers-tool. 156 symbols across 41 files."
---

# Server

156 symbols | 41 files | Cohesion: 75%

## When to Use

- Working with code in `src/`
- Understanding how assertSafeKey, writeImageBytes, brandGuidelinesKey work
- Modifying server-related functionality

## Key Files

| File                                                       | Symbols                                                                                                                     |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/server/object-store.server.ts`                    | put, getText, putText, remove, list (+27)                                                                                   |
| `src/lib/server/inspiration/inspiration-storage.server.ts` | ensureSafeSlug, slugify, categoryDirPrefix, categoryMetaKey, itemMdKey (+16)                                                |
| `src/lib/server/clickhouse.ts`                             | loadEnvFileValues, parseRequestTimeout, getRequiredEnv, getEnvValue, getClickHouseConfig (+5)                               |
| `src/lib/server/auth-guards.ts`                            | requireAuthenticatedApiUser, hasSuperUserRole, isPublicPath, isApiPath, isAdminPath (+4)                                    |
| `src/lib/server/brand-storage.ts`                          | brandGuidelinesKey, deleteBrandAsset, readBrandGuidelines, writeBrandGuidelines, ensureSafeSlug (+3)                        |
| `src/lib/server/env.ts`                                    | loadEnvFileValues, readEnv, loadImageGeneratorEnv, getStorageEnv, hasSupabaseStorage (+3)                                   |
| `src/lib/server/scraper-db.ts`                             | getConnectionString, getScraperPool, readQueueBatch, readPendingQueueRowsForEntities, countPendingQueueRowsForEntities (+2) |
| `src/lib/server/auth.ts`                                   | getRequiredEnv, getAuthConfig, getAuthConfigKey, createAuth, getAuth                                                        |
| `src/lib/server/image-storage.ts`                          | writeImageBytes, ensureSafeId, imageKey, readImageBytes                                                                     |
| `src/lib/server/reference-storage.ts`                      | ensureSafeId, extensionForContentType, referenceKey, writeReferenceFile                                                     |

## Entry Points

Start here when exploring this area:

- **`assertSafeKey`** (Function) — `src/lib/server/object-store.server.ts:53`
- **`writeImageBytes`** (Function) — `src/lib/server/image-storage.ts:26`
- **`brandGuidelinesKey`** (Function) — `src/lib/server/brand-storage.ts:52`
- **`deleteBrandAsset`** (Function) — `src/lib/server/brand-storage.ts:85`
- **`readBrandGuidelines`** (Function) — `src/lib/server/brand-storage.ts:94`

## Key Symbols

| Symbol                         | Type     | File                                                       | Line |
| ------------------------------ | -------- | ---------------------------------------------------------- | ---- |
| `LocalObjectStore`             | Class    | `src/lib/server/object-store.server.ts`                    | 70   |
| `SupabaseObjectStore`          | Class    | `src/lib/server/object-store.server.ts`                    | 157  |
| `assertSafeKey`                | Function | `src/lib/server/object-store.server.ts`                    | 53   |
| `writeImageBytes`              | Function | `src/lib/server/image-storage.ts`                          | 26   |
| `brandGuidelinesKey`           | Function | `src/lib/server/brand-storage.ts`                          | 52   |
| `deleteBrandAsset`             | Function | `src/lib/server/brand-storage.ts`                          | 85   |
| `readBrandGuidelines`          | Function | `src/lib/server/brand-storage.ts`                          | 94   |
| `writeBrandGuidelines`         | Function | `src/lib/server/brand-storage.ts`                          | 101  |
| `getDefaultDeleteItemFormData` | Function | `src/lib/services/inspiration/category-form.ts`            | 54   |
| `slugify`                      | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 61   |
| `listCategories`               | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 120  |
| `getCategory`                  | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 134  |
| `createCategory`               | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 161  |
| `renameCategory`               | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 180  |
| `deleteCategory`               | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 201  |
| `listItems`                    | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 229  |
| `getItem`                      | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 256  |
| `createItem`                   | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 285  |
| `updateItem`                   | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 306  |
| `deleteItem`                   | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 344  |

## Execution Flows

| Flow                               | Type            | Steps |
| ---------------------------------- | --------------- | ----- |
| `Load → LoadEnvFileValues`         | cross_community | 9     |
| `Load → LoadEnvFileValues`         | cross_community | 9     |
| `ProcessBatch → LoadEnvFileValues` | cross_community | 8     |
| `Load → LoadEnvFileValues`         | cross_community | 6     |
| `GET → AssertSafeKey`              | cross_community | 6     |
| `GET → LoadEnvFileValues`          | cross_community | 6     |
| `PUT → AssertSafeKey`              | cross_community | 6     |
| `PUT → From`                       | cross_community | 6     |
| `PUT → LoadEnvFileValues`          | cross_community | 6     |
| `POST → AssertSafeKey`             | cross_community | 6     |

## Connected Areas

| Area          | Connections |
| ------------- | ----------- |
| Services      | 7 calls     |
| Restaurants   | 6 calls     |
| Notifications | 3 calls     |
| Guidelines    | 3 calls     |
| Offers        | 2 calls     |
| Brand-context | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "assertSafeKey"})` — see callers and callees
2. `gitnexus_query({query: "server"})` — find related execution flows
3. Read key files listed above for implementation details
