---
name: id
description: "Skill for the [id] area of marketing-offers-tool. 16 symbols across 13 files."
---

# [id]

16 symbols | 13 files | Cohesion: 57%

## When to Use

- Working with code in `src/`
- Understanding how requireAuthenticatedApiUser, GET, deletePreset work
- Modifying [id]-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/server/object-store.server.ts` | tryGet, tryGet |
| `src/lib/services/image-generator/composer-library.server.ts` | deletePreset, deleteTemplate |
| `src/routes/api/images/[id]/file/+server.ts` | generatedImageKey, GET |
| `src/lib/server/auth-guards.ts` | requireAuthenticatedApiUser |
| `src/routes/api/brand-assets/+server.ts` | GET |
| `src/lib/services/brand-context/brand-context.server.ts` | searchBrandAssets |
| `src/lib/server/inspiration/inspiration-storage.server.ts` | inspirationImageKey |
| `src/routes/api/images/enhance/+server.ts` | loadReferenceImages |
| `src/routes/api/brand-assets/[id]/+server.ts` | GET |
| `src/routes/api/images/references/[id]/+server.ts` | GET |

## Entry Points

Start here when exploring this area:

- **`requireAuthenticatedApiUser`** (Function) — `src/lib/server/auth-guards.ts:23`
- **`GET`** (Function) — `src/routes/api/brand-assets/+server.ts:8`
- **`deletePreset`** (Function) — `src/lib/services/image-generator/composer-library.server.ts:140`
- **`deleteTemplate`** (Function) — `src/lib/services/image-generator/composer-library.server.ts:252`
- **`searchBrandAssets`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:41`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `requireAuthenticatedApiUser` | Function | `src/lib/server/auth-guards.ts` | 23 |
| `GET` | Function | `src/routes/api/brand-assets/+server.ts` | 8 |
| `deletePreset` | Function | `src/lib/services/image-generator/composer-library.server.ts` | 140 |
| `deleteTemplate` | Function | `src/lib/services/image-generator/composer-library.server.ts` | 252 |
| `searchBrandAssets` | Function | `src/lib/services/brand-context/brand-context.server.ts` | 41 |
| `inspirationImageKey` | Function | `src/lib/server/inspiration/inspiration-storage.server.ts` | 88 |
| `GET` | Function | `src/routes/api/brand-assets/[id]/+server.ts` | 6 |
| `GET` | Function | `src/routes/api/images/[id]/file/+server.ts` | 16 |
| `GET` | Function | `src/routes/api/images/references/[id]/+server.ts` | 6 |
| `DELETE` | Function | `src/routes/api/images/templates/[id]/+server.ts` | 28 |
| `DELETE` | Function | `src/routes/api/images/presets/[id]/+server.ts` | 28 |
| `GET` | Function | `src/routes/api/image-generator/inspiration/[slug]/[item]/image/+server.ts` | 16 |
| `tryGet` | Method | `src/lib/server/object-store.server.ts` | 33 |
| `tryGet` | Method | `src/lib/server/object-store.server.ts` | 91 |
| `loadReferenceImages` | Function | `src/routes/api/images/enhance/+server.ts` | 69 |
| `generatedImageKey` | Function | `src/routes/api/images/[id]/file/+server.ts` | 9 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `GET → LoadEnvFileValues` | cross_community | 5 |
| `GET → LoadEnvFileValues` | cross_community | 5 |
| `LoadReferenceImages → LoadEnvFileValues` | cross_community | 5 |
| `GET → AssertSafeKey` | cross_community | 4 |
| `GET → ParseRoles` | cross_community | 4 |
| `LoadReferenceImages → AssertSafeKey` | cross_community | 4 |
| `GET → From` | cross_community | 3 |
| `GET → GetAuthenticatedUserRole` | cross_community | 3 |
| `POST → RequireAuthenticatedApiUser` | cross_community | 3 |
| `PUT → RequireAuthenticatedApiUser` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Server | 9 calls |
| Inspiration | 2 calls |

## How to Explore

1. `gitnexus_context({name: "requireAuthenticatedApiUser"})` — see callers and callees
2. `gitnexus_query({query: "[id]"})` — find related execution flows
3. Read key files listed above for implementation details
