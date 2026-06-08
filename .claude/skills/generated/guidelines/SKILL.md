---
name: guidelines
description: "Skill for the Guidelines area of marketing-offers-tool. 9 symbols across 6 files."
---

# Guidelines

9 symbols | 6 files | Cohesion: 59%

## When to Use

- Working with code in `src/`
- Understanding how requireApiPermission, load, GET work
- Modifying guidelines-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts` | parseBrandId, brandSlugOr404, GET, PUT |
| `src/lib/server/auth-guards.ts` | requireApiPermission |
| `src/routes/copywriter/me/+page.server.ts` | load |
| `src/routes/api/copy/+server.ts` | GET |
| `src/lib/services/copywriter/copywriter.server.ts` | listGeneratedCopies |
| `src/lib/services/brand-context/brand-context.server.ts` | setBrandGuidelines |

## Entry Points

Start here when exploring this area:

- **`requireApiPermission`** (Function) — `src/lib/server/auth-guards.ts:153`
- **`load`** (Function) — `src/routes/copywriter/me/+page.server.ts:4`
- **`GET`** (Function) — `src/routes/api/copy/+server.ts:5`
- **`listGeneratedCopies`** (Function) — `src/lib/services/copywriter/copywriter.server.ts:23`
- **`setBrandGuidelines`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:134`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `requireApiPermission` | Function | `src/lib/server/auth-guards.ts` | 153 |
| `load` | Function | `src/routes/copywriter/me/+page.server.ts` | 4 |
| `GET` | Function | `src/routes/api/copy/+server.ts` | 5 |
| `listGeneratedCopies` | Function | `src/lib/services/copywriter/copywriter.server.ts` | 23 |
| `setBrandGuidelines` | Function | `src/lib/services/brand-context/brand-context.server.ts` | 134 |
| `GET` | Function | `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts` | 44 |
| `PUT` | Function | `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts` | 53 |
| `parseBrandId` | Function | `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts` | 16 |
| `brandSlugOr404` | Function | `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts` | 27 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `GET → AssertSafeKey` | cross_community | 6 |
| `GET → LoadEnvFileValues` | cross_community | 6 |
| `PUT → AssertSafeKey` | cross_community | 6 |
| `PUT → From` | cross_community | 6 |
| `PUT → LoadEnvFileValues` | cross_community | 6 |
| `GET → From` | cross_community | 5 |
| `GET → EnsureSafeSlug` | cross_community | 5 |
| `PUT → EnsureSafeSlug` | cross_community | 5 |
| `GET → GetText` | cross_community | 4 |
| `GET → GetSupabaseClient` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Server | 4 calls |
| Services | 1 calls |
| Image-generator | 1 calls |

## How to Explore

1. `gitnexus_context({name: "requireApiPermission"})` — see callers and callees
2. `gitnexus_query({query: "guidelines"})` — find related execution flows
3. Read key files listed above for implementation details
