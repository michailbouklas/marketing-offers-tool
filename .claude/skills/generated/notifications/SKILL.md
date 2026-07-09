---
name: notifications
description: "Skill for the Notifications area of marketing-offers-tool. 25 symbols across 9 files."
---

# Notifications

25 symbols | 9 files | Cohesion: 73%

## When to Use

- Working with code in `src/`
- Understanding how getMaxQueueId, runOfferDigest, getCursor work
- Modifying notifications-related functionality

## Key Files

| File                                                     | Symbols                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/lib/services/notifications/offer-digest.server.ts`  | release, tryAcquireDigestLock, emptySummary, runOfferDigest, consolidatePerUser (+1)       |
| `src/lib/server/notifications/notifications-env.ts`      | loadEnvFileValues, readEnv, loadNotificationsEnv, getNotificationsEnv, hasQueueSource (+1) |
| `src/lib/services/notifications/digest-email.server.ts`  | escapeHtml, restaurantLabel, groupByRestaurant, buildDigestEmail                           |
| `scripts/run-digest.ts`                                  | parseArgs, main                                                                            |
| `src/lib/services/notifications/digest-cursor.server.ts` | getCursor, advanceCursor                                                                   |
| `src/lib/server/mailer.server.ts`                        | getTransporter, sendDigestEmail                                                            |
| `src/lib/server/scraper-db.ts`                           | getMaxQueueId                                                                              |
| `src/lib/server/scheduler.server.ts`                     | startScheduler                                                                             |
| `src/lib/services/user-monitor.server.ts`                | getMonitorUsersByEntityIds                                                                 |

## Entry Points

Start here when exploring this area:

- **`getMaxQueueId`** (Function) — `src/lib/server/scraper-db.ts:168`
- **`runOfferDigest`** (Function) — `src/lib/services/notifications/offer-digest.server.ts:199`
- **`getCursor`** (Function) — `src/lib/services/notifications/digest-cursor.server.ts:26`
- **`advanceCursor`** (Function) — `src/lib/services/notifications/digest-cursor.server.ts:57`
- **`startScheduler`** (Function) — `src/lib/server/scheduler.server.ts:52`

## Key Symbols

| Symbol                       | Type     | File                                                     | Line |
| ---------------------------- | -------- | -------------------------------------------------------- | ---- |
| `getMaxQueueId`              | Function | `src/lib/server/scraper-db.ts`                           | 168  |
| `runOfferDigest`             | Function | `src/lib/services/notifications/offer-digest.server.ts`  | 199  |
| `getCursor`                  | Function | `src/lib/services/notifications/digest-cursor.server.ts` | 26   |
| `advanceCursor`              | Function | `src/lib/services/notifications/digest-cursor.server.ts` | 57   |
| `startScheduler`             | Function | `src/lib/server/scheduler.server.ts`                     | 52   |
| `sendDigestEmail`            | Function | `src/lib/server/mailer.server.ts`                        | 65   |
| `getNotificationsEnv`        | Function | `src/lib/server/notifications/notifications-env.ts`      | 160  |
| `hasQueueSource`             | Function | `src/lib/server/notifications/notifications-env.ts`      | 170  |
| `hasNotificationsTransport`  | Function | `src/lib/server/notifications/notifications-env.ts`      | 182  |
| `getMonitorUsersByEntityIds` | Function | `src/lib/services/user-monitor.server.ts`                | 31   |
| `buildDigestEmail`           | Function | `src/lib/services/notifications/digest-email.server.ts`  | 50   |
| `parseArgs`                  | Function | `scripts/run-digest.ts`                                  | 36   |
| `main`                       | Function | `scripts/run-digest.ts`                                  | 61   |
| `tryAcquireDigestLock`       | Function | `src/lib/services/notifications/offer-digest.server.ts`  | 42   |
| `emptySummary`               | Function | `src/lib/services/notifications/offer-digest.server.ts`  | 81   |
| `getTransporter`             | Function | `src/lib/server/mailer.server.ts`                        | 16   |
| `loadEnvFileValues`          | Function | `src/lib/server/notifications/notifications-env.ts`      | 24   |
| `readEnv`                    | Function | `src/lib/server/notifications/notifications-env.ts`      | 63   |
| `loadNotificationsEnv`       | Function | `src/lib/server/notifications/notifications-env.ts`      | 133  |
| `consolidatePerUser`         | Function | `src/lib/services/notifications/offer-digest.server.ts`  | 97   |

## Execution Flows

| Flow                       | Type            | Steps |
| -------------------------- | --------------- | ----- |
| `Load → LoadEnvFileValues` | cross_community | 9     |
| `Load → LoadEnvFileValues` | cross_community | 9     |
| `POST → LoadEnvFileValues` | cross_community | 9     |
| `POST → Release`           | cross_community | 4     |
| `POST → EmptySummary`      | cross_community | 4     |

## Connected Areas

| Area   | Connections |
| ------ | ----------- |
| Server | 5 calls     |

## How to Explore

1. `gitnexus_context({name: "getMaxQueueId"})` — see callers and callees
2. `gitnexus_query({query: "notifications"})` — find related execution flows
3. Read key files listed above for implementation details
