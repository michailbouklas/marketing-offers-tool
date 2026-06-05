---
name: inspiration
description: "Skill for the Inspiration area of marketing-offers-tool. 52 symbols across 10 files."
---

# Inspiration

52 symbols | 10 files | Cohesion: 86%

## When to Use

- Working with code in `src/`
- Understanding how brandGuidelinesKey, deleteBrandAsset, readBrandGuidelines work
- Modifying inspiration-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/server/inspiration/inspiration-storage.server.ts` | ensureSafeSlug, slugify, categoryDirPrefix, categoryMetaKey, itemMdKey (+15) |
| `src/lib/server/object-store.server.ts` | getText, putText, remove, list, toPath (+10) |
| `src/lib/server/brand-storage.ts` | brandGuidelinesKey, deleteBrandAsset, readBrandGuidelines, writeBrandGuidelines |
| `src/lib/services/inspiration/category-form.ts` | getDefaultDeleteItemFormData, getDefaultCreateCategoryFormData, getDefaultRenameCategoryFormData, getDefaultDeleteCategoryFormData |
| `src/lib/server/inspiration/frontmatter.ts` | serializeFrontmatter, parseFrontmatter, sanitizeValue, lines |
| `src/routes/image-generator/inspiration/[slug]/+page.server.ts` | load |
| `src/routes/admin/prompt-gallery/[slug]/+page.server.ts` | load |
| `src/routes/api/admin/prompt-gallery/[slug]/items/+server.ts` | POST |
| `src/routes/api/admin/prompt-gallery/[slug]/items/[item]/+server.ts` | PUT |
| `src/routes/admin/prompt-gallery/+page.server.ts` | load |

## Entry Points

Start here when exploring this area:

- **`brandGuidelinesKey`** (Function) — `src/lib/server/brand-storage.ts:52`
- **`deleteBrandAsset`** (Function) — `src/lib/server/brand-storage.ts:85`
- **`readBrandGuidelines`** (Function) — `src/lib/server/brand-storage.ts:94`
- **`writeBrandGuidelines`** (Function) — `src/lib/server/brand-storage.ts:101`
- **`getDefaultDeleteItemFormData`** (Function) — `src/lib/services/inspiration/category-form.ts:54`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `brandGuidelinesKey` | Function | `src/lib/server/brand-storage.ts` | 52 |
| `deleteBrandAsset` | Function | `src/lib/server/brand-storage.ts` | 85 |
| `readBrandGuidelines` | Function | `src/lib/server/brand-storage.ts` | 94 |
| `writeBrandGuidelines` | Function | `src/lib/server/brand-storage.ts` | 101 |
| `getDefaultDeleteItemFormData` | Function | `src/lib/services/inspiration/category-form.ts` | 54 |
| `slugify` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 61 |
| `listCategories` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 120 |
| `getCategory` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 134 |
| `createCategory` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 161 |
| `renameCategory` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 180 |
| `deleteCategory` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 201 |
| `listItems` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 229 |
| `getItem` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 256 |
| `createItem` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 285 |
| `updateItem` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 306 |
| `deleteItem` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 344 |
| `serializeFrontmatter` | Function | `src/lib/server/inspiration/frontmatter.ts` | 17 |
| `parseFrontmatter` | Function | `src/lib/server/inspiration/frontmatter.ts` | 32 |
| `load` | Function | `src/routes/image-generator/inspiration/[slug]/+page.server.ts` | 9 |
| `load` | Function | `src/routes/admin/prompt-gallery/[slug]/+page.server.ts` | 17 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `GET → AssertSafeKey` | cross_community | 6 |
| `PUT → AssertSafeKey` | cross_community | 6 |
| `PUT → From` | cross_community | 6 |
| `POST → AssertSafeKey` | cross_community | 6 |
| `Load → AssertSafeKey` | cross_community | 6 |
| `POST → AssertSafeKey` | cross_community | 6 |
| `GET → AssertSafeKey` | cross_community | 6 |
| `Load → AssertSafeKey` | cross_community | 5 |
| `Load → From` | cross_community | 5 |
| `POST → LoadEnvFileValues` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Server | 21 calls |
| Services | 3 calls |
| Guidelines | 2 calls |

## How to Explore

1. `gitnexus_context({name: "brandGuidelinesKey"})` — see callers and callees
2. `gitnexus_query({query: "inspiration"})` — find related execution flows
3. Read key files listed above for implementation details
