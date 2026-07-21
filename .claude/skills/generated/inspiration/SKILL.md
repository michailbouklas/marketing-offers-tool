---
name: inspiration
description: "Skill for the Inspiration area of marketing-offers-tool. 19 symbols across 7 files."
---

# Inspiration

19 symbols | 7 files | Cohesion: 69%

## When to Use

- Working with code in `src/`
- Understanding how deleteBrandAsset, deleteCategory, getItem work
- Modifying inspiration-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/server/inspiration/inspiration-storage.server.ts` | ensureSafeSlug, categoryDirPrefix, itemMdKey, itemImageStorageKey, deleteCategory (+3) |
| `src/lib/server/object-store.server.ts` | remove, remove, remove |
| `src/lib/services/inspiration/category-form.ts` | getDefaultCreateCategoryFormData, getDefaultRenameCategoryFormData, getDefaultDeleteCategoryFormData |
| `src/lib/server/inspiration/frontmatter.ts` | sanitizeValue, lines |
| `src/lib/server/brand-storage.ts` | deleteBrandAsset |
| `src/routes/api/admin/prompt-gallery/[slug]/items/[item]/+server.ts` | PUT |
| `src/routes/admin/prompt-gallery/+page.server.ts` | load |

## Entry Points

Start here when exploring this area:

- **`deleteBrandAsset`** (Function) — `src/lib/server/brand-storage.ts:85`
- **`deleteCategory`** (Function) — `src/lib/server/inspiration/inspiration-storage.server.ts:201`
- **`getItem`** (Function) — `src/lib/server/inspiration/inspiration-storage.server.ts:256`
- **`updateItem`** (Function) — `src/lib/server/inspiration/inspiration-storage.server.ts:306`
- **`deleteItem`** (Function) — `src/lib/server/inspiration/inspiration-storage.server.ts:344`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `deleteBrandAsset` | Function | `src/lib/server/brand-storage.ts` | 85 |
| `deleteCategory` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 201 |
| `getItem` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 256 |
| `updateItem` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 306 |
| `deleteItem` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 344 |
| `PUT` | Function | `src/routes/api/admin/prompt-gallery/[slug]/items/[item]/+server.ts` | 10 |
| `load` | Function | `src/routes/admin/prompt-gallery/+page.server.ts` | 22 |
| `getDefaultCreateCategoryFormData` | Function | `src/lib/services/inspiration/category-form.ts` | 42 |
| `getDefaultRenameCategoryFormData` | Function | `src/lib/services/inspiration/category-form.ts` | 46 |
| `getDefaultDeleteCategoryFormData` | Function | `src/lib/services/inspiration/category-form.ts` | 50 |
| `lines` | Function | `src/lib/server/inspiration/frontmatter.ts` | 21 |
| `remove` | Method | `src/lib/server/object-store.server.ts` | 39 |
| `remove` | Method | `src/lib/server/object-store.server.ts` | 119 |
| `remove` | Method | `src/lib/server/object-store.server.ts` | 213 |
| `ensureSafeSlug` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 44 |
| `categoryDirPrefix` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 72 |
| `itemMdKey` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 80 |
| `itemImageStorageKey` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 84 |
| `sanitizeValue` | Function | `src/lib/server/inspiration/frontmatter.ts` | 13 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Load → AssertSafeKey` | cross_community | 5 |
| `Load → From` | cross_community | 5 |
| `PUT → LoadEnvFileValues` | cross_community | 5 |
| `PUT → AssertSafeKey` | cross_community | 5 |
| `Load → GetText` | cross_community | 4 |
| `Load → List` | cross_community | 4 |
| `PUT → From` | cross_community | 4 |
| `Load → RequireAuthenticatedUser` | cross_community | 3 |
| `Load → HasPermission` | cross_community | 3 |
| `Load → GetSupabaseClient` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Server | 20 calls |
| Services | 2 calls |

## How to Explore

1. `gitnexus_context({name: "deleteBrandAsset"})` — see callers and callees
2. `gitnexus_query({query: "inspiration"})` — find related execution flows
3. Read key files listed above for implementation details
