---
name: id
description: "Skill for the [id] area of marketing-offers-tool. 12 symbols across 10 files."
---

# [id]

12 symbols | 10 files | Cohesion: 57%

## When to Use

- Working with code in `src/`
- Understanding how requireAuthenticatedApiUser, GET, deletePreset work
- Modifying [id]-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/services/image-generator/composer-library.server.ts` | deletePreset, deleteTemplate |
| `src/routes/api/images/[id]/file/+server.ts` | generatedImageKey, GET |
| `src/lib/server/object-store.server.ts` | tryGet |
| `src/lib/server/auth-guards.ts` | requireAuthenticatedApiUser |
| `src/routes/api/brand-assets/+server.ts` | GET |
| `src/lib/services/brand-context/brand-context.server.ts` | searchBrandAssets |
| `src/routes/api/brand-assets/[id]/+server.ts` | GET |
| `src/routes/api/images/templates/[id]/+server.ts` | DELETE |
| `src/routes/api/images/references/[id]/+server.ts` | GET |
| `src/routes/api/images/presets/[id]/+server.ts` | DELETE |

## Entry Points

Start here when exploring this area:

- **`requireAuthenticatedApiUser`** (Function) — `src/lib/server/auth-guards.ts:18`
- **`GET`** (Function) — `src/routes/api/brand-assets/+server.ts:8`
- **`deletePreset`** (Function) — `src/lib/services/image-generator/composer-library.server.ts:140`
- **`deleteTemplate`** (Function) — `src/lib/services/image-generator/composer-library.server.ts:252`
- **`searchBrandAssets`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:41`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `requireAuthenticatedApiUser` | Function | `src/lib/server/auth-guards.ts` | 18 |
| `GET` | Function | `src/routes/api/brand-assets/+server.ts` | 8 |
| `deletePreset` | Function | `src/lib/services/image-generator/composer-library.server.ts` | 140 |
| `deleteTemplate` | Function | `src/lib/services/image-generator/composer-library.server.ts` | 252 |
| `searchBrandAssets` | Function | `src/lib/services/brand-context/brand-context.server.ts` | 41 |
| `GET` | Function | `src/routes/api/brand-assets/[id]/+server.ts` | 6 |
| `GET` | Function | `src/routes/api/images/[id]/file/+server.ts` | 13 |
| `DELETE` | Function | `src/routes/api/images/templates/[id]/+server.ts` | 28 |
| `GET` | Function | `src/routes/api/images/references/[id]/+server.ts` | 6 |
| `DELETE` | Function | `src/routes/api/images/presets/[id]/+server.ts` | 28 |
| `tryGet` | Method | `src/lib/server/object-store.server.ts` | 20 |
| `generatedImageKey` | Function | `src/routes/api/images/[id]/file/+server.ts` | 6 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `GET → LoadEnvFileValues` | cross_community | 5 |
| `GET → LoadEnvFileValues` | cross_community | 5 |
| `GET → LoadEnvFileValues` | cross_community | 5 |
| `GET → GetSupabaseClient` | cross_community | 3 |
| `GET → SupabaseObjectStore` | cross_community | 3 |
| `GET → LocalObjectStore` | cross_community | 3 |
| `GET → RequireAuthenticatedApiUser` | cross_community | 3 |
| `PUT → RequireAuthenticatedApiUser` | cross_community | 3 |
| `POST → RequireAuthenticatedApiUser` | cross_community | 3 |
| `PATCH → RequireAuthenticatedApiUser` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Server | 3 calls |

## How to Explore

1. `gitnexus_context({name: "requireAuthenticatedApiUser"})` — see callers and callees
2. `gitnexus_query({query: "[id]"})` — find related execution flows
3. Read key files listed above for implementation details
