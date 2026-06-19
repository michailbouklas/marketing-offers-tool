---
name: notifications
description: "Skill for the Notifications area of marketing-offers-tool. 25 symbols across 9 files."
---

# Notifications

25 symbols | 9 files | Cohesion: 86%

## When to Use

- Working with code in `src/`
- Understanding how getMonitorUsersByEntityIds, tryRunDigestExclusively, startScheduler work
- Modifying notifications-related functionality

## Key Files

| File                                                       | Symbols                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/lib/services/notifications/offer-digest.server.ts`    | release, tryAcquireDigestLock, emptySummary, consolidatePerUser, processBatch (+1)         |
| `src/lib/server/notifications/notifications-env.ts`        | loadEnvFileValues, readEnv, loadNotificationsEnv, getNotificationsEnv, hasQueueSource (+1) |
| `src/lib/services/notifications/digest-email.server.ts`    | escapeHtml, restaurantLabel, groupByRestaurant, buildDigestEmail                           |
| `scripts/run-digest.ts`                                    | parseArgs, main                                                                            |
| `src/lib/server/scheduler.server.ts`                       | tryRunDigestExclusively, startScheduler                                                    |
| `src/lib/server/mailer.server.ts`                          | getTransporter, sendDigestEmail                                                            |
| `src/lib/services/user-monitor.server.ts`                  | getMonitorUsersByEntityIds                                                                 |
| `src/lib/services/notifications/digest-cursor.server.ts`   | advanceCursor                                                                              |
| `src/routes/api/admin/notifications/run-digest/+server.ts` | POST                                                                                       |

## Entry Points

Start here when exploring this area:

- **`getMonitorUsersByEntityIds`** (Function) — `src/lib/services/user-monitor.server.ts:31`
- **`tryRunDigestExclusively`** (Function) — `src/lib/server/scheduler.server.ts:32`
- **`startScheduler`** (Function) — `src/lib/server/scheduler.server.ts:52`
- **`sendDigestEmail`** (Function) — `src/lib/server/mailer.server.ts:65`
- **`runOfferDigest`** (Function) — `src/lib/services/notifications/offer-digest.server.ts:199`

## Key Symbols

| Symbol                       | Type     | File                                                       | Line |
| ---------------------------- | -------- | ---------------------------------------------------------- | ---- |
| `getMonitorUsersByEntityIds` | Function | `src/lib/services/user-monitor.server.ts`                  | 31   |
| `tryRunDigestExclusively`    | Function | `src/lib/server/scheduler.server.ts`                       | 32   |
| `startScheduler`             | Function | `src/lib/server/scheduler.server.ts`                       | 52   |
| `sendDigestEmail`            | Function | `src/lib/server/mailer.server.ts`                          | 65   |
| `runOfferDigest`             | Function | `src/lib/services/notifications/offer-digest.server.ts`    | 199  |
| `advanceCursor`              | Function | `src/lib/services/notifications/digest-cursor.server.ts`   | 57   |
| `getNotificationsEnv`        | Function | `src/lib/server/notifications/notifications-env.ts`        | 160  |
| `hasQueueSource`             | Function | `src/lib/server/notifications/notifications-env.ts`        | 170  |
| `hasNotificationsTransport`  | Function | `src/lib/server/notifications/notifications-env.ts`        | 182  |
| `POST`                       | Function | `src/routes/api/admin/notifications/run-digest/+server.ts` | 12   |
| `buildDigestEmail`           | Function | `src/lib/services/notifications/digest-email.server.ts`    | 50   |
| `parseArgs`                  | Function | `scripts/run-digest.ts`                                    | 36   |
| `main`                       | Function | `scripts/run-digest.ts`                                    | 61   |
| `getTransporter`             | Function | `src/lib/server/mailer.server.ts`                          | 16   |
| `tryAcquireDigestLock`       | Function | `src/lib/services/notifications/offer-digest.server.ts`    | 42   |
| `emptySummary`               | Function | `src/lib/services/notifications/offer-digest.server.ts`    | 81   |
| `consolidatePerUser`         | Function | `src/lib/services/notifications/offer-digest.server.ts`    | 97   |
| `processBatch`               | Function | `src/lib/services/notifications/offer-digest.server.ts`    | 129  |
| `loadEnvFileValues`          | Function | `src/lib/server/notifications/notifications-env.ts`        | 24   |
| `readEnv`                    | Function | `src/lib/server/notifications/notifications-env.ts`        | 63   |

## Execution Flows

| Flow                                 | Type            | Steps |
| ------------------------------------ | --------------- | ----- |
| `Load → LoadEnvFileValues`           | cross_community | 9     |
| `Load → LoadEnvFileValues`           | cross_community | 9     |
| `POST → LoadEnvFileValues`           | intra_community | 9     |
| `StartScheduler → LoadEnvFileValues` | intra_community | 9     |
| `ProcessBatch → LoadEnvFileValues`   | cross_community | 8     |
| `POST → ParseRoles`                  | cross_community | 4     |
| `POST → Release`                     | intra_community | 4     |
| `POST → EmptySummary`                | intra_community | 4     |
| `StartScheduler → Release`           | intra_community | 4     |
| `StartScheduler → EmptySummary`      | intra_community | 4     |

## Connected Areas

| Area     | Connections |
| -------- | ----------- |
| Server   | 4 calls     |
| Services | 1 calls     |

## How to Explore

1. `gitnexus_context({name: "getMonitorUsersByEntityIds"})` — see callers and callees
2. `gitnexus_query({query: "notifications"})` — find related execution flows
3. Read key files listed above for implementation details
