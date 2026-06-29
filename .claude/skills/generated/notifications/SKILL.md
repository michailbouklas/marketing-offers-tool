---
name: notifications
description: "Skill for the Notifications area of marketing-offers-tool. 31 symbols across 11 files."
---

# Notifications

31 symbols | 11 files | Cohesion: 66%

## When to Use

- Working with code in `src/`
- Understanding how tryRunDigestExclusively, startScheduler, sendDigestEmail work
- Modifying notifications-related functionality

## Key Files

| File                                                       | Symbols                                                                                               |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/lib/server/notifications/notifications-env.ts`        | loadEnvFileValues, readEnv, loadNotificationsEnv, getNotificationsEnv, hasNotificationsTransport (+1) |
| `src/lib/services/notifications/offer-digest.server.ts`    | release, tryAcquireDigestLock, emptySummary, runOfferDigest, consolidatePerUser (+1)                  |
| `src/lib/services/notifications/digest-email.server.ts`    | escapeHtml, restaurantLabel, groupByRestaurant, buildDigestEmail                                      |
| `src/lib/services/notifications/pending.server.ts`         | toPendingNotification, getPendingNotificationCountForUser, getPendingNotificationsForUser             |
| `src/lib/server/scheduler.server.ts`                       | tryRunDigestExclusively, startScheduler                                                               |
| `src/lib/server/mailer.server.ts`                          | getTransporter, sendDigestEmail                                                                       |
| `scripts/run-digest.ts`                                    | parseArgs, main                                                                                       |
| `src/lib/services/notifications/digest-cursor.server.ts`   | advanceCursor, peekCursor                                                                             |
| `src/lib/server/scraper-db.ts`                             | countPendingQueueRowsForEntities, getRestaurantNames                                                  |
| `src/routes/api/admin/notifications/run-digest/+server.ts` | POST                                                                                                  |

## Entry Points

Start here when exploring this area:

- **`tryRunDigestExclusively`** (Function) — `src/lib/server/scheduler.server.ts:32`
- **`startScheduler`** (Function) — `src/lib/server/scheduler.server.ts:52`
- **`sendDigestEmail`** (Function) — `src/lib/server/mailer.server.ts:65`
- **`getNotificationsEnv`** (Function) — `src/lib/server/notifications/notifications-env.ts:160`
- **`hasNotificationsTransport`** (Function) — `src/lib/server/notifications/notifications-env.ts:182`

## Key Symbols

| Symbol                               | Type     | File                                                       | Line |
| ------------------------------------ | -------- | ---------------------------------------------------------- | ---- |
| `tryRunDigestExclusively`            | Function | `src/lib/server/scheduler.server.ts`                       | 32   |
| `startScheduler`                     | Function | `src/lib/server/scheduler.server.ts`                       | 52   |
| `sendDigestEmail`                    | Function | `src/lib/server/mailer.server.ts`                          | 65   |
| `getNotificationsEnv`                | Function | `src/lib/server/notifications/notifications-env.ts`        | 160  |
| `hasNotificationsTransport`          | Function | `src/lib/server/notifications/notifications-env.ts`        | 182  |
| `POST`                               | Function | `src/routes/api/admin/notifications/run-digest/+server.ts` | 12   |
| `runOfferDigest`                     | Function | `src/lib/services/notifications/offer-digest.server.ts`    | 199  |
| `advanceCursor`                      | Function | `src/lib/services/notifications/digest-cursor.server.ts`   | 57   |
| `countPendingQueueRowsForEntities`   | Function | `src/lib/server/scraper-db.ts`                             | 146  |
| `hasQueueSource`                     | Function | `src/lib/server/notifications/notifications-env.ts`        | 170  |
| `getPendingNotificationCountForUser` | Function | `src/lib/services/notifications/pending.server.ts`         | 53   |
| `getPendingNotificationsForUser`     | Function | `src/lib/services/notifications/pending.server.ts`         | 76   |
| `peekCursor`                         | Function | `src/lib/services/notifications/digest-cursor.server.ts`   | 48   |
| `getRestaurantNames`                 | Function | `src/lib/server/scraper-db.ts`                             | 181  |
| `getMonitorUsersByEntityIds`         | Function | `src/lib/services/user-monitor.server.ts`                  | 31   |
| `buildDigestEmail`                   | Function | `src/lib/services/notifications/digest-email.server.ts`    | 50   |
| `getTransporter`                     | Function | `src/lib/server/mailer.server.ts`                          | 16   |
| `loadEnvFileValues`                  | Function | `src/lib/server/notifications/notifications-env.ts`        | 24   |
| `readEnv`                            | Function | `src/lib/server/notifications/notifications-env.ts`        | 63   |
| `loadNotificationsEnv`               | Function | `src/lib/server/notifications/notifications-env.ts`        | 133  |

## Execution Flows

| Flow                           | Type            | Steps |
| ------------------------------ | --------------- | ----- |
| `Load → LoadEnvFileValues`     | cross_community | 9     |
| `Load → LoadEnvFileValues`     | cross_community | 9     |
| `POST → LoadEnvFileValues`     | cross_community | 9     |
| `POST → ParseRoles`            | cross_community | 4     |
| `POST → Release`               | cross_community | 4     |
| `POST → EmptySummary`          | cross_community | 4     |
| `Load → GetMonitoredEntityIds` | cross_community | 3     |

## Connected Areas

| Area     | Connections |
| -------- | ----------- |
| Server   | 5 calls     |
| Services | 3 calls     |

## How to Explore

1. `gitnexus_context({name: "tryRunDigestExclusively"})` — see callers and callees
2. `gitnexus_query({query: "notifications"})` — find related execution flows
3. Read key files listed above for implementation details
