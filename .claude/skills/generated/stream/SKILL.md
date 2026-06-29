---
name: stream
description: "Skill for the Stream area of marketing-offers-tool. 5 symbols across 1 files."
---

# Stream

5 symbols | 1 files | Cohesion: 80%

## When to Use

- Working with code in `src/`
- Understanding how safeEnqueue, cleanup, emitTerminal work
- Modifying stream-related functionality

## Key Files

| File                                                  | Symbols                                          |
| ----------------------------------------------------- | ------------------------------------------------ |
| `src/routes/api/competition/scrape/stream/+server.ts` | frame, start, safeEnqueue, cleanup, emitTerminal |

## Entry Points

Start here when exploring this area:

- **`safeEnqueue`** (Function) — `src/routes/api/competition/scrape/stream/+server.ts:46`
- **`cleanup`** (Function) — `src/routes/api/competition/scrape/stream/+server.ts:57`
- **`emitTerminal`** (Function) — `src/routes/api/competition/scrape/stream/+server.ts:84`
- **`start`** (Method) — `src/routes/api/competition/scrape/stream/+server.ts:41`

## Key Symbols

| Symbol         | Type     | File                                                  | Line |
| -------------- | -------- | ----------------------------------------------------- | ---- |
| `safeEnqueue`  | Function | `src/routes/api/competition/scrape/stream/+server.ts` | 46   |
| `cleanup`      | Function | `src/routes/api/competition/scrape/stream/+server.ts` | 57   |
| `emitTerminal` | Function | `src/routes/api/competition/scrape/stream/+server.ts` | 84   |
| `start`        | Method   | `src/routes/api/competition/scrape/stream/+server.ts` | 41   |
| `frame`        | Function | `src/routes/api/competition/scrape/stream/+server.ts` | 13   |

## Execution Flows

| Flow             | Type            | Steps |
| ---------------- | --------------- | ----- |
| `Start → GetJob` | cross_community | 3     |

## Connected Areas

| Area        | Connections |
| ----------- | ----------- |
| Competition | 2 calls     |
| Services    | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "safeEnqueue"})` — see callers and callees
2. `gitnexus_query({query: "stream"})` — find related execution flows
3. Read key files listed above for implementation details
