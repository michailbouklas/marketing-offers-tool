---
name: assets
description: "Skill for the Assets area of marketing-offers-tool. 9 symbols across 7 files."
---

# Assets

9 symbols | 7 files | Cohesion: 55%

## When to Use

- Working with code in `src/`
- Understanding how requireApiPermission, load, GET work
- Modifying assets-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | parseBrandId, GET, POST |
| `src/lib/server/auth-guards.ts` | requireApiPermission |
| `src/routes/copywriter/me/+page.server.ts` | load |
| `src/routes/api/copy/+server.ts` | GET |
| `src/lib/services/copywriter/copywriter.server.ts` | listGeneratedCopies |
| `src/lib/services/brand-context/brand-context.server.ts` | createBrandAsset |
| `src/routes/api/copy/generate/+server.ts` | POST |

## Entry Points

Start here when exploring this area:

- **`requireApiPermission`** (Function) — `src/lib/server/auth-guards.ts:153`
- **`load`** (Function) — `src/routes/copywriter/me/+page.server.ts:4`
- **`GET`** (Function) — `src/routes/api/copy/+server.ts:5`
- **`listGeneratedCopies`** (Function) — `src/lib/services/copywriter/copywriter.server.ts:23`
- **`createBrandAsset`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:86`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `requireApiPermission` | Function | `src/lib/server/auth-guards.ts` | 153 |
| `load` | Function | `src/routes/copywriter/me/+page.server.ts` | 4 |
| `GET` | Function | `src/routes/api/copy/+server.ts` | 5 |
| `listGeneratedCopies` | Function | `src/lib/services/copywriter/copywriter.server.ts` | 23 |
| `createBrandAsset` | Function | `src/lib/services/brand-context/brand-context.server.ts` | 86 |
| `POST` | Function | `src/routes/api/copy/generate/+server.ts` | 9 |
| `GET` | Function | `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | 21 |
| `POST` | Function | `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | 41 |
| `parseBrandId` | Function | `src/routes/api/admin/brands/[brandId]/assets/+server.ts` | 10 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `POST → AssertSafeKey` | cross_community | 6 |
| `POST → LoadEnvFileValues` | cross_community | 6 |
| `POST → From` | cross_community | 5 |
| `POST → Put` | cross_community | 4 |
| `POST → EnsureSafeSlug` | cross_community | 4 |
| `POST → GetSupabaseClient` | cross_community | 4 |
| `POST → SupabaseObjectStore` | cross_community | 4 |
| `POST → LocalObjectStore` | cross_community | 4 |
| `POST → FetchFn` | cross_community | 4 |
| `POST → OpenAITextProviderError` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Server | 3 calls |
| Services | 2 calls |
| [id] | 1 calls |
| Copywriter | 1 calls |
| Brand-context | 1 calls |

## How to Explore

1. `gitnexus_context({name: "requireApiPermission"})` — see callers and callees
2. `gitnexus_query({query: "assets"})` — find related execution flows
3. Read key files listed above for implementation details
