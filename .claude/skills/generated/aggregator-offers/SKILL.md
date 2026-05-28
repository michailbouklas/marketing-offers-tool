---
name: aggregator-offers
description: "Skill for the Aggregator-offers area of marketing-offers-tool. 4 symbols across 3 files."
---

# Aggregator-offers

4 symbols | 3 files | Cohesion: 36%

## When to Use

- Working with code in `src/`
- Understanding how createOffer, updateOffer, mapOfferEditorFormToCreateInput work
- Modifying aggregator-offers-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/routes/aggregator-offers/+page.server.ts` | createOffer, updateOffer |
| `src/lib/services/offer-editor-form.ts` | mapOfferEditorFormToCreateInput |
| `src/lib/server/auth-guards.ts` | requireAuthenticatedUser |

## Entry Points

Start here when exploring this area:

- **`createOffer`** (Function) — `src/routes/aggregator-offers/+page.server.ts:62`
- **`updateOffer`** (Function) — `src/routes/aggregator-offers/+page.server.ts:86`
- **`mapOfferEditorFormToCreateInput`** (Function) — `src/lib/services/offer-editor-form.ts:78`
- **`requireAuthenticatedUser`** (Function) — `src/lib/server/auth-guards.ts:5`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `createOffer` | Function | `src/routes/aggregator-offers/+page.server.ts` | 62 |
| `updateOffer` | Function | `src/routes/aggregator-offers/+page.server.ts` | 86 |
| `mapOfferEditorFormToCreateInput` | Function | `src/lib/services/offer-editor-form.ts` | 78 |
| `requireAuthenticatedUser` | Function | `src/lib/server/auth-guards.ts` | 5 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Load → RequireAuthenticatedUser` | cross_community | 3 |
| `POST → RequireAuthenticatedUser` | cross_community | 3 |
| `GET → RequireAuthenticatedUser` | cross_community | 3 |
| `PUT → RequireAuthenticatedUser` | cross_community | 3 |
| `Load → RequireAuthenticatedUser` | cross_community | 3 |
| `Load → RequireAuthenticatedUser` | cross_community | 3 |
| `GET → RequireAuthenticatedUser` | cross_community | 3 |
| `DELETE → RequireAuthenticatedUser` | cross_community | 3 |
| `POST → RequireAuthenticatedUser` | cross_community | 3 |
| `GET → RequireAuthenticatedUser` | cross_community | 3 |

## How to Explore

1. `gitnexus_context({name: "createOffer"})` — see callers and callees
2. `gitnexus_query({query: "aggregator-offers"})` — find related execution flows
3. Read key files listed above for implementation details
