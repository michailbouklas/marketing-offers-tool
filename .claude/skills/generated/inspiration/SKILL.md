---
name: inspiration
description: "Skill for the Inspiration area of marketing-offers-tool. 6 symbols across 3 files."
---

# Inspiration

6 symbols | 3 files | Cohesion: 78%

## When to Use

- Working with code in `src/`
- Understanding how load, getDefaultCreateCategoryFormData, getDefaultRenameCategoryFormData work
- Modifying inspiration-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/services/inspiration/category-form.ts` | getDefaultCreateCategoryFormData, getDefaultRenameCategoryFormData, getDefaultDeleteCategoryFormData |
| `src/lib/server/inspiration/frontmatter.ts` | sanitizeValue, lines |
| `src/routes/admin/prompt-gallery/+page.server.ts` | load |

## Entry Points

Start here when exploring this area:

- **`load`** (Function) — `src/routes/admin/prompt-gallery/+page.server.ts:22`
- **`getDefaultCreateCategoryFormData`** (Function) — `src/lib/services/inspiration/category-form.ts:42`
- **`getDefaultRenameCategoryFormData`** (Function) — `src/lib/services/inspiration/category-form.ts:46`
- **`getDefaultDeleteCategoryFormData`** (Function) — `src/lib/services/inspiration/category-form.ts:50`
- **`lines`** (Function) — `src/lib/server/inspiration/frontmatter.ts:21`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `load` | Function | `src/routes/admin/prompt-gallery/+page.server.ts` | 22 |
| `getDefaultCreateCategoryFormData` | Function | `src/lib/services/inspiration/category-form.ts` | 42 |
| `getDefaultRenameCategoryFormData` | Function | `src/lib/services/inspiration/category-form.ts` | 46 |
| `getDefaultDeleteCategoryFormData` | Function | `src/lib/services/inspiration/category-form.ts` | 50 |
| `lines` | Function | `src/lib/server/inspiration/frontmatter.ts` | 21 |
| `sanitizeValue` | Function | `src/lib/server/inspiration/frontmatter.ts` | 13 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Load → AssertSafeKey` | cross_community | 5 |
| `Load → From` | cross_community | 5 |
| `Load → GetText` | cross_community | 4 |
| `Load → List` | cross_community | 4 |
| `Load → RequireAuthenticatedUser` | cross_community | 3 |
| `Load → HasPermission` | cross_community | 3 |
| `Load → GetSupabaseClient` | cross_community | 3 |
| `Load → SupabaseObjectStore` | cross_community | 3 |
| `Load → LocalObjectStore` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Server | 2 calls |
| Restaurants | 1 calls |

## How to Explore

1. `gitnexus_context({name: "load"})` — see callers and callees
2. `gitnexus_query({query: "inspiration"})` — find related execution flows
3. Read key files listed above for implementation details
