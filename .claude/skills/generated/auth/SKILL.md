---
name: auth
description: "Skill for the Auth area of marketing-offers-tool. 4 symbols across 3 files."
---

# Auth

4 symbols | 3 files | Cohesion: 50%

## When to Use

- Working with code in `src/`
- Understanding how requireAdminUser, parseRoles, isAdminRole work
- Modifying auth-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/auth/roles.ts` | parseRoles, isAdminRole |
| `src/lib/server/auth-guards.ts` | requireAdminUser |
| `src/lib/services/user-editor-form.ts` | normalizeUserRoles |

## Entry Points

Start here when exploring this area:

- **`requireAdminUser`** (Function) — `src/lib/server/auth-guards.ts:34`
- **`parseRoles`** (Function) — `src/lib/auth/roles.ts:80`
- **`isAdminRole`** (Function) — `src/lib/auth/roles.ts:93`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `requireAdminUser` | Function | `src/lib/server/auth-guards.ts` | 34 |
| `parseRoles` | Function | `src/lib/auth/roles.ts` | 80 |
| `isAdminRole` | Function | `src/lib/auth/roles.ts` | 93 |
| `normalizeUserRoles` | Function | `src/lib/services/user-editor-form.ts` | 123 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Load → ParseRoles` | cross_community | 5 |
| `Load → ParseRoles` | cross_community | 4 |
| `GET → ParseRoles` | cross_community | 4 |
| `Load → ParseRoles` | cross_community | 4 |
| `Load → ParseRoles` | cross_community | 4 |
| `GET → ParseRoles` | cross_community | 4 |
| `POST → ParseRoles` | cross_community | 4 |
| `GET → ParseRoles` | cross_community | 4 |
| `GET → ParseRoles` | cross_community | 4 |
| `Load → ParseRoles` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Services | 1 calls |
| Server | 1 calls |

## How to Explore

1. `gitnexus_context({name: "requireAdminUser"})` — see callers and callees
2. `gitnexus_query({query: "auth"})` — find related execution flows
3. Read key files listed above for implementation details
