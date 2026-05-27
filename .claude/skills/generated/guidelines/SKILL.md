---
name: guidelines
description: "Skill for the Guidelines area of marketing-offers-tool. 7 symbols across 4 files."
---

# Guidelines

7 symbols | 4 files | Cohesion: 58%

## When to Use

- Working with code in `src/`
- Understanding how readBrandGuidelines, GET, getBrandGuidelines work
- Modifying guidelines-related functionality

## Key Files

| File                                                          | Symbols                                |
| ------------------------------------------------------------- | -------------------------------------- |
| `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts` | parseBrandId, brandSlugOr404, GET, PUT |
| `src/lib/server/brand-storage.ts`                             | readBrandGuidelines                    |
| `src/routes/api/brand-guidelines/+server.ts`                  | GET                                    |
| `src/lib/services/brand-context/brand-context.server.ts`      | getBrandGuidelines                     |

## Entry Points

Start here when exploring this area:

- **`readBrandGuidelines`** (Function) — `src/lib/server/brand-storage.ts:131`
- **`GET`** (Function) — `src/routes/api/brand-guidelines/+server.ts:7`
- **`getBrandGuidelines`** (Function) — `src/lib/services/brand-context/brand-context.server.ts:87`
- **`GET`** (Function) — `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts:45`
- **`PUT`** (Function) — `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts:55`

## Key Symbols

| Symbol                | Type     | File                                                          | Line |
| --------------------- | -------- | ------------------------------------------------------------- | ---- |
| `readBrandGuidelines` | Function | `src/lib/server/brand-storage.ts`                             | 131  |
| `GET`                 | Function | `src/routes/api/brand-guidelines/+server.ts`                  | 7    |
| `getBrandGuidelines`  | Function | `src/lib/services/brand-context/brand-context.server.ts`      | 87   |
| `GET`                 | Function | `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts` | 45   |
| `PUT`                 | Function | `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts` | 55   |
| `parseBrandId`        | Function | `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts` | 17   |
| `brandSlugOr404`      | Function | `src/routes/api/admin/brands/[brandId]/guidelines/+server.ts` | 28   |

## Execution Flows

| Flow                             | Type            | Steps |
| -------------------------------- | --------------- | ----- |
| `Load → EnsureSafeSlug`          | cross_community | 6     |
| `GET → EnsureSafeSlug`           | cross_community | 6     |
| `GET → LoadEnvFileValues`        | cross_community | 5     |
| `PUT → LoadEnvFileValues`        | cross_community | 5     |
| `GET → LoadEnvFileValues`        | cross_community | 5     |
| `GET → RequireAuthenticatedUser` | cross_community | 3     |
| `GET → GetAuthenticatedUserRole` | cross_community | 3     |
| `GET → IsAdminRole`              | cross_community | 3     |
| `PUT → RequireAuthenticatedUser` | cross_community | 3     |
| `PUT → GetAuthenticatedUserRole` | cross_community | 3     |

## Connected Areas

| Area   | Connections |
| ------ | ----------- |
| Server | 7 calls     |
| [id]   | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "readBrandGuidelines"})` — see callers and callees
2. `gitnexus_query({query: "guidelines"})` — find related execution flows
3. Read key files listed above for implementation details
