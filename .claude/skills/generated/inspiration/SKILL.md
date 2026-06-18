---
name: inspiration
description: "Skill for the Inspiration area of marketing-offers-tool. 32 symbols across 9 files."
---

# Inspiration

32 symbols | 9 files | Cohesion: 66%

## When to Use

- Working with code in `src/`
- Understanding how listCategories, getCategory, deleteCategory work
- Modifying inspiration-related functionality

## Key Files

| File                                                                 | Symbols                                                                                                                            |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/server/inspiration/inspiration-storage.server.ts`           | categoryDirPrefix, categoryMetaKey, listCategories, getCategory, deleteCategory (+9)                                               |
| `src/lib/server/object-store.server.ts`                              | list, list, list, remove, remove (+1)                                                                                              |
| `src/lib/services/inspiration/category-form.ts`                      | getDefaultDeleteItemFormData, getDefaultCreateCategoryFormData, getDefaultRenameCategoryFormData, getDefaultDeleteCategoryFormData |
| `src/lib/server/inspiration/frontmatter.ts`                          | parseFrontmatter, sanitizeValue, lines                                                                                             |
| `src/routes/admin/prompt-gallery/[slug]/+page.server.ts`             | load                                                                                                                               |
| `src/routes/image-generator/inspiration/[slug]/+page.server.ts`      | load                                                                                                                               |
| `src/lib/server/brand-storage.ts`                                    | deleteBrandAsset                                                                                                                   |
| `src/routes/api/admin/prompt-gallery/[slug]/items/[item]/+server.ts` | PUT                                                                                                                                |
| `src/routes/admin/prompt-gallery/+page.server.ts`                    | load                                                                                                                               |

## Entry Points

Start here when exploring this area:

- **`listCategories`** (Function) — `src/lib/server/inspiration/inspiration-storage.server.ts:120`
- **`getCategory`** (Function) — `src/lib/server/inspiration/inspiration-storage.server.ts:134`
- **`deleteCategory`** (Function) — `src/lib/server/inspiration/inspiration-storage.server.ts:201`
- **`listItems`** (Function) — `src/lib/server/inspiration/inspiration-storage.server.ts:229`
- **`parseFrontmatter`** (Function) — `src/lib/server/inspiration/frontmatter.ts:32`

## Key Symbols

| Symbol                             | Type     | File                                                                 | Line |
| ---------------------------------- | -------- | -------------------------------------------------------------------- | ---- |
| `listCategories`                   | Function | `src/lib/server/inspiration/inspiration-storage.server.ts`           | 120  |
| `getCategory`                      | Function | `src/lib/server/inspiration/inspiration-storage.server.ts`           | 134  |
| `deleteCategory`                   | Function | `src/lib/server/inspiration/inspiration-storage.server.ts`           | 201  |
| `listItems`                        | Function | `src/lib/server/inspiration/inspiration-storage.server.ts`           | 229  |
| `parseFrontmatter`                 | Function | `src/lib/server/inspiration/frontmatter.ts`                          | 32   |
| `getDefaultDeleteItemFormData`     | Function | `src/lib/services/inspiration/category-form.ts`                      | 54   |
| `load`                             | Function | `src/routes/admin/prompt-gallery/[slug]/+page.server.ts`             | 17   |
| `load`                             | Function | `src/routes/image-generator/inspiration/[slug]/+page.server.ts`      | 9    |
| `deleteBrandAsset`                 | Function | `src/lib/server/brand-storage.ts`                                    | 85   |
| `inspirationImageKey`              | Function | `src/lib/server/inspiration/inspiration-storage.server.ts`           | 88   |
| `getItem`                          | Function | `src/lib/server/inspiration/inspiration-storage.server.ts`           | 256  |
| `updateItem`                       | Function | `src/lib/server/inspiration/inspiration-storage.server.ts`           | 306  |
| `deleteItem`                       | Function | `src/lib/server/inspiration/inspiration-storage.server.ts`           | 344  |
| `PUT`                              | Function | `src/routes/api/admin/prompt-gallery/[slug]/items/[item]/+server.ts` | 10   |
| `getDefaultCreateCategoryFormData` | Function | `src/lib/services/inspiration/category-form.ts`                      | 42   |
| `getDefaultRenameCategoryFormData` | Function | `src/lib/services/inspiration/category-form.ts`                      | 46   |
| `getDefaultDeleteCategoryFormData` | Function | `src/lib/services/inspiration/category-form.ts`                      | 50   |
| `load`                             | Function | `src/routes/admin/prompt-gallery/+page.server.ts`                    | 22   |
| `lines`                            | Function | `src/lib/server/inspiration/frontmatter.ts`                          | 21   |
| `list`                             | Method   | `src/lib/server/object-store.server.ts`                              | 46   |

## Execution Flows

| Flow                             | Type            | Steps |
| -------------------------------- | --------------- | ----- |
| `Load → AssertSafeKey`           | cross_community | 5     |
| `Load → From`                    | cross_community | 5     |
| `POST → AssertSafeKey`           | cross_community | 5     |
| `PUT → LoadEnvFileValues`        | cross_community | 5     |
| `PUT → AssertSafeKey`            | cross_community | 5     |
| `Load → LoadEnvFileValues`       | cross_community | 5     |
| `Load → AssertSafeKey`           | cross_community | 5     |
| `Load → From`                    | cross_community | 5     |
| `RenameCategory → AssertSafeKey` | cross_community | 5     |
| `ListCategories → AssertSafeKey` | cross_community | 5     |

## Connected Areas

| Area       | Connections |
| ---------- | ----------- |
| Server     | 26 calls    |
| Services   | 3 calls     |
| Guidelines | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "listCategories"})` — see callers and callees
2. `gitnexus_query({query: "inspiration"})` — find related execution flows
3. Read key files listed above for implementation details
