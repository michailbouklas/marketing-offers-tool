---
name: notifications
description: "Skill for the Notifications area of marketing-offers-tool. 32 symbols across 12 files."
---

# Notifications

32 symbols | 12 files | Cohesion: 74%

## When to Use

- Working with code in `src/`
- Understanding how tryRunDigestExclusively, startScheduler, sendDigestEmail work
- Modifying notifications-related functionality

## Key Files

| File                                                       | Symbols                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/lib/services/notifications/offer-digest.server.ts`    | release, tryAcquireDigestLock, emptySummary, runOfferDigest, consolidatePerUser (+1)       |
| `src/lib/server/notifications/notifications-env.ts`        | loadEnvFileValues, readEnv, loadNotificationsEnv, getNotificationsEnv, hasQueueSource (+1) |
| `src/lib/services/notifications/digest-email.server.ts`    | escapeHtml, restaurantLabel, groupByRestaurant, buildDigestEmail                           |
| `src/lib/services/notifications/pending.server.ts`         | toPendingNotification, getPendingNotificationCountForUser, getPendingNotificationsForUser  |
| `scripts/run-digest.ts`                                    | parseArgs, main                                                                            |
| `src/lib/server/scheduler.server.ts`                       | tryRunDigestExclusively, startScheduler                                                    |
| `src/lib/server/mailer.server.ts`                          | getTransporter, sendDigestEmail                                                            |
| `src/lib/services/notifications/digest-cursor.server.ts`   | advanceCursor, peekCursor                                                                  |
| `src/lib/server/scraper-db.ts`                             | countPendingQueueRowsForEntities, getRestaurantNames                                       |
| `src/routes/api/admin/notifications/run-digest/+server.ts` | POST                                                                                       |

## Entry Points

Start here when exploring this area:

- **`tryRunDigestExclusively`** (Function) — `src/lib/server/scheduler.server.ts:32`
- **`startScheduler`** (Function) — `src/lib/server/scheduler.server.ts:52`
- **`sendDigestEmail`** (Function) — `src/lib/server/mailer.server.ts:65`
- **`runOfferDigest`** (Function) — `src/lib/services/notifications/offer-digest.server.ts:199`
- **`advanceCursor`** (Function) — `src/lib/services/notifications/digest-cursor.server.ts:57`

## Key Symbols

| Symbol                               | Type     | File                                                       | Line |
| ------------------------------------ | -------- | ---------------------------------------------------------- | ---- |
| `tryRunDigestExclusively`            | Function | `src/lib/server/scheduler.server.ts`                       | 32   |
| `startScheduler`                     | Function | `src/lib/server/scheduler.server.ts`                       | 52   |
| `sendDigestEmail`                    | Function | `src/lib/server/mailer.server.ts`                          | 65   |
| `runOfferDigest`                     | Function | `src/lib/services/notifications/offer-digest.server.ts`    | 199  |
| `advanceCursor`                      | Function | `src/lib/services/notifications/digest-cursor.server.ts`   | 57   |
| `getNotificationsEnv`                | Function | `src/lib/server/notifications/notifications-env.ts`        | 160  |
| `hasQueueSource`                     | Function | `src/lib/server/notifications/notifications-env.ts`        | 170  |
| `hasNotificationsTransport`          | Function | `src/lib/server/notifications/notifications-env.ts`        | 182  |
| `POST`                               | Function | `src/routes/api/admin/notifications/run-digest/+server.ts` | 12   |
| `load`                               | Function | `src/routes/+layout.server.ts`                             | 8    |
| `countPendingQueueRowsForEntities`   | Function | `src/lib/server/scraper-db.ts`                             | 146  |
| `getPendingNotificationCountForUser` | Function | `src/lib/services/notifications/pending.server.ts`         | 53   |
| `getPendingNotificationsForUser`     | Function | `src/lib/services/notifications/pending.server.ts`         | 76   |
| `peekCursor`                         | Function | `src/lib/services/notifications/digest-cursor.server.ts`   | 48   |
| `getMonitorUsersByEntityIds`         | Function | `src/lib/services/user-monitor.server.ts`                  | 31   |
| `getRestaurantNames`                 | Function | `src/lib/server/scraper-db.ts`                             | 181  |
| `buildDigestEmail`                   | Function | `src/lib/services/notifications/digest-email.server.ts`    | 50   |
| `parseArgs`                          | Function | `scripts/run-digest.ts`                                    | 36   |
| `main`                               | Function | `scripts/run-digest.ts`                                    | 61   |
| `getTransporter`                     | Function | `src/lib/server/mailer.server.ts`                          | 16   |

## Execution Flows

| Flow                           | Type            | Steps |
| ------------------------------ | --------------- | ----- |
| `Load → LoadEnvFileValues`     | cross_community | 9     |
| `Load → LoadEnvFileValues`     | cross_community | 9     |
| `Load → ParseAggregatorValue`  | cross_community | 3     |
| `Load → Get`                   | cross_community | 3     |
| `Load → GetMonitoredEntityIds` | cross_community | 3     |
| `Load → PeekCursor`            | intra_community | 3     |

## Connected Areas

| Area            | Connections |
| --------------- | ----------- |
| Server          | 6 calls     |
| Services        | 4 calls     |
| Aggregator-kpis | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "tryRunDigestExclusively"})` — see callers and callees
2. `gitnexus_query({query: "notifications"})` — find related execution flows
3. Read key files listed above for implementation details
