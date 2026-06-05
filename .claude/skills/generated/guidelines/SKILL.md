---
name: guidelines
description: "Skill for the Guidelines area of marketing-offers-tool. 6 symbols across 3 files."
---

# Guidelines

6 symbols | 3 files | Cohesion: 56%

## When to Use

- Working with code in `src/`
- Understanding how requireApiPermission, setBrandGuidelines, GET work
- Modifying guidelines-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts` | parseBrandId, brandSlugOr404, GET, PUT |
| `src/lib/server/auth-guards.ts` | requireApiPermission |
| `src/lib/services/brand-context/brand-context.server.ts` | setBrandGuidelines |

## Entry Points

Start here when exploring this area:

- **`requireApiPermission`** (Function) — `src/lib/server/auth-guards.ts:153`
- **`setBrandGuidelines`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:134`
- **`GET`** (Function) — `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts:44`
- **`PUT`** (Function) — `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts:53`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `requireApiPermission` | Function | `src/lib/server/auth-guards.ts` | 153 |
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
| Image-generator | 1 calls |

## How to Explore

1. `gitnexus_context({name: "requireApiPermission"})` — see callers and callees
2. `gitnexus_query({query: "guidelines"})` — find related execution flows
3. Read key files listed above for implementation details
