---
name: scripts
description: "Skill for the Scripts area of marketing-offers-tool. 13 symbols across 2 files."
---

# Scripts

13 symbols | 2 files | Cohesion: 100%

## When to Use

- Working with code in `scripts/`
- Understanding how normalizeValue, addLookupEntry, buildBrandLookup work
- Modifying scripts-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `scripts/create-marketing-users.ts` | normalizeValue, addLookupEntry, buildBrandLookup, matchedBrands, resolveBrand (+6) |
| `scripts/backfill-storage.ts` | contentTypeFor, main |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `normalizeValue` | Function | `scripts/create-marketing-users.ts` | 111 |
| `addLookupEntry` | Function | `scripts/create-marketing-users.ts` | 149 |
| `buildBrandLookup` | Function | `scripts/create-marketing-users.ts` | 166 |
| `matchedBrands` | Function | `scripts/create-marketing-users.ts` | 176 |
| `resolveBrand` | Function | `scripts/create-marketing-users.ts` | 198 |
| `resolveBrandIds` | Function | `scripts/create-marketing-users.ts` | 216 |
| `formatFailure` | Function | `scripts/create-marketing-users.ts` | 241 |
| `replaceUserBrandAssignments` | Function | `scripts/create-marketing-users.ts` | 279 |
| `main` | Function | `scripts/create-marketing-users.ts` | 310 |
| `getRequiredEnv` | Function | `scripts/create-marketing-users.ts` | 115 |
| `buildAuth` | Function | `scripts/create-marketing-users.ts` | 125 |
| `contentTypeFor` | Function | `scripts/backfill-storage.ts` | 30 |
| `main` | Function | `scripts/backfill-storage.ts` | 53 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Main → AddLookupEntry` | intra_community | 4 |
| `Main → NormalizeValue` | intra_community | 4 |

## How to Explore

1. `gitnexus_context({name: "normalizeValue"})` — see callers and callees
2. `gitnexus_query({query: "scripts"})` — find related execution flows
3. Read key files listed above for implementation details
