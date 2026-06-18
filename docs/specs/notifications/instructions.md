# Offer Notification Queue — Part B Handoff

**Audience:** the team building the user-facing "new offer" notifications in **`marketing-offers-tool`**.
**Status:** Part A (the producer, in this repo) is **implemented and live**. Part B (the consumer: match →
consolidate → email) is **not started**. This document is the contract and a build guide for Part B.

---

## 1. What this feature does

Users of `marketing-offers-tool` can **monitor** competitor restaurants (the `user_monitor` table). When a
restaurant they monitor gets a **brand-new offer**, they should be emailed. To avoid spam, every new offer
across **all** of a user's monitored restaurants must be **consolidated into a single digest email** per
delivery cycle.

Producing the "a new offer appeared" signal can only be done reliably at the moment the scraper first writes
the offer — so that half lives in this repo (`aggregator-menu-scraper-crawlee`). Everything that needs users,
emails, and `user_monitor` lives in `marketing-offers-tool` — that's Part B, your job.

---

## 2. Data topology (read this first)

There are **three** stores involved. They are not the same database.

| Store                                         | What it holds                                                                                 | Who writes              | Who reads                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------ |
| **`aggregator_scraper`** (Postgres)           | Source of truth for offers/restaurants/aggregators **and the new `offer_notification_queue`** | this scraper            | analytics replication; (optionally) Part B |
| **`aggregator_scraper_replica`** (ClickHouse) | Read replica of the above, `ReplacingMergeTree`, query with `FINAL`                           | replication pipeline    | `marketing-offers-tool` competition pages  |
| **app Postgres** (marketing-offers-tool)      | `user`, `user_monitor`, auth/session                                                          | `marketing-offers-tool` | `marketing-offers-tool`                    |

Key consequence: **the queue rows and the `user_monitor` rows live in different databases.** The join between
them happens in **application code** in Part B, not in SQL. The `entity_key` column (below) is precomputed
specifically so that join is a plain string equality with `user_monitor.entityId`.

---

## 3. The producer (Part A) — what already happens

In `db/persist-scrape.ts` (`persistScrapeContext`), during every scrape, when an offer is inserted for the
**first time** (detected via `firstSeenAt === scrapedAt`, i.e. the upsert took the `create` branch), one row
is appended to `offer_notification_queue`. This runs automatically for both single-URL (`index.ts`) and batch
(`process-multiple.ts`) flows.

**Guarantees / semantics you can rely on:**

- **Append-only.** The producer only ever `INSERT`s. It never updates or deletes queue rows. The queue does
  not track "sent" state — that is Part B's responsibility (see §7).
- **One row per genuinely-new offer.** Re-scraping a restaurant whose offer already exists produces **no**
  row (verified live: a re-scrape of the same URL added zero rows).
- **Re-activations are NOT enqueued.** An offer that was seen before, went inactive, and reappears keeps its
  original `first_seen_at`, so it is _not_ treated as new. If you need re-activation notifications, that's a
  producer change — talk to the scraper team. (Tracked as out-of-scope in the plan.)
- **No retention/pruning yet.** Rows accumulate. Part B advancing a cursor does not delete them. Decide a
  retention story (see §10).

---

## 4. The data contract: `offer_notification_queue`

Postgres table `offer_notification_queue` (Prisma model `OfferNotificationQueue`). Columns:

| Column (DB)     | Prisma field   | Type                    | Notes                                                                       |
| --------------- | -------------- | ----------------------- | --------------------------------------------------------------------------- |
| `id`            | `id`           | `int` PK, autoincrement | **Monotonic. Use as the cursor.**                                           |
| `offer_id`      | `offerId`      | `int`                   | FK value into `offer.id` (scalar; no enforced relation)                     |
| `restaurant_id` | `restaurantId` | `int`                   | `restaurant.id`                                                             |
| `aggregator_id` | `aggregatorId` | `int`                   | `aggregator.id` (= competition "processorId")                               |
| `session_id`    | `sessionId`    | `int`                   | the `scrape_session.id` that created the offer                              |
| `product_id`    | `productId`    | `int?`                  | nullable — offer may not map to a product                                   |
| `entity_key`    | `entityKey`    | `text`                  | **`"${aggregator_id}:${restaurant_id}"`** — matches `user_monitor.entityId` |
| `title`         | `title`        | `text`                  | offer title (already unescaped)                                             |
| `description`   | `description`  | `text?`                 | nullable                                                                    |
| `created_at`    | `createdAt`    | `timestamp`             | when the row was enqueued                                                   |

Indexes: `(created_at)` and `(entity_key)`.

### The match key

When a user monitors a competition restaurant, `marketing-offers-tool` writes
`user_monitor { section: 'competition', entityId: "${processorId}:${restaurantId}" }`
(see `src/routes/competition/restaurants/+page.svelte` → ``entityId={`${row.processorId}:${row.id}`}``).
`processorId` is the ClickHouse `aggregator.id`, which **equals** this repo's `aggregator.id` (ClickHouse is a
replica of `aggregator_scraper`). Therefore:

> **`offer_notification_queue.entity_key` is byte-for-byte comparable to `user_monitor.entityId` for
> `section = 'competition'`.** No transformation needed.

(Verified live: a fresh KFC scrape produced a queue row with `entity_key = "2:3071"` for aggregator 2 /
restaurant 3071.)

---

## 5. Part B responsibilities (overview)

```
cron (every N hours)                    [marketing-offers-tool]
  1. read NEW queue rows  (id > cursor)        ← §6
  2. resolve monitoring users per entity_key   ← §6 (join user_monitor, section='competition')
  3. group new offers per user                 ← §7 (one bucket per user, across all their restaurants)
  4. send ONE digest email per user            ← §8
  5. advance cursor + record what was sent      ← §7
```

---

## 6. Reading the queue + matching monitors

You have two options for reading queue rows. **Recommended: read from the ClickHouse replica**, because
`marketing-offers-tool` already has a ClickHouse client and competition-DB plumbing, and the queue table will
be replicated like the rest of the schema.

### Option A — ClickHouse replica (recommended)

- The replica DB is `aggregator_scraper_replica` (resolved by `getCompetitionDatabase()` in
  `src/lib/server/competition-db.ts`). Reference the table via the existing `competitionTable("offer_notification_queue")`
  helper.
- Replica tables are `ReplacingMergeTree(_version) ORDER BY tuple(id)` — **query with `FINAL`** and never
  select `_sign`/`_version`.
- **Action item:** the new `offer_notification_queue` table must be **added to the PG→ClickHouse replication
  pipeline and to the ClickHouse schema** (`docs/competition-scraper/clickhouse-schema.sql` in this repo's
  sibling docs). Coordinate with whoever owns replication. Until it's replicated, the table won't appear in
  ClickHouse. Because the producer is append-only, a `ReplacingMergeTree` keyed on `id` is a clean fit.

```sql
-- new rows since the last processed id
SELECT id, offer_id, restaurant_id, aggregator_id, product_id, entity_key, title, description, created_at
FROM aggregator_scraper_replica.offer_notification_queue FINAL
WHERE id > {cursor:Int64}
ORDER BY id
LIMIT {batch:Int64}
```

### Option B — direct Postgres read

Add a read-only connection to `aggregator_scraper` and `SELECT ... WHERE id > $cursor ORDER BY id`. Simpler
consistency (no replication lag), but introduces a new DB dependency for the app. Either is acceptable; pick
based on your ops preferences.

### Matching to `user_monitor`

For the batch's distinct `entity_key`s, look up monitors in the **app Postgres** (single-DB query there):

```ts
const entityKeys = [...new Set(rows.map((r) => r.entity_key))];
const monitors = await prisma.user_monitor.findMany({
  where: { section: "competition", entityId: { in: entityKeys } },
  select: { userId: true, entityId: true },
});
// entityId -> userId[]
```

Reuse the conventions in `src/lib/services/user-monitor.server.ts` (`getMonitoredEntityIds`, `MonitorSectionValue`).

---

## 7. Consolidation + cursor + idempotency

**Consolidation** — one bucket per user, spanning all their monitored restaurants:

```ts
// Map<userId, QueueRow[]>
const perUser = new Map<string, QueueRow[]>();
for (const row of rows) {
  for (const userId of usersByEntityKey.get(row.entity_key) ?? []) {
    (perUser.get(userId) ?? perUser.set(userId, []).get(userId)!).push(row);
  }
}
// each user with ≥1 new offer gets exactly ONE email containing all rows in their bucket,
// grouped by restaurant for readability.
```

**Cursor + idempotency** — keep all send-state in the **app Postgres** so you never write back to
`aggregator_scraper`:

- Store `last_processed_queue_id` (a single-row settings table or a small `notification_cursor` table).
- A cycle reads `id > last_processed_queue_id`, sends, then sets the cursor to the max `id` processed.
- This is **at-least-once**: if the job crashes after sending some emails but before advancing the cursor, the
  next run reprocesses that id range and may re-send. For a digest this is usually acceptable. If you need
  exactly-once, add a `notification_sent (user_id, max_queue_id, sent_at)` ledger and skip users already
  covered for that id range, then advance the cursor only after all sends succeed.

> Do **not** use `created_at` as the cursor (ties/clock skew). Use the monotonic `id`.

---

## 8. Email (does not exist yet)

`marketing-offers-tool` currently has **no email transport**. Part B must add one:

- Pick a transport (nodemailer/SMTP, Resend, SendGrid, Postmark…). Add config to the app's env.
- Recipient = `user.email` (join `user` by `user_monitor.userId`).
- Template: subject like "N new competitor offers", body grouped by restaurant. You'll want a human-readable
  restaurant name — `entity_key` only carries ids. Fetch restaurant names from the ClickHouse replica
  (`restaurant` table) keyed by `restaurant_id`, or denormalize a name into the queue later if this proves
  noisy (producer change).
- Respect any existing user notification/opt-out preferences if/when they exist.

---

## 9. Scheduling

A scheduled digest (cron) was the chosen cadence. Options: a platform cron hitting an authenticated route, a
worker process, or BunQueue's bundled `croner`. Cadence (hourly vs daily) is a product decision — start
conservative (e.g. daily) and tune. Make the job **idempotent and safe to overlap** (a run lock).

---

## 10. Edge cases & gotchas

- **Different DBs, no SQL join.** Queue (scraper) and `user_monitor` (app) cannot be joined in one query.
  Match in app code via `entity_key` ↔ `entityId`.
- **No monitors for a key.** Most new offers will match zero monitors — that's normal; just skip them. Still
  advance the cursor past them.
- **Replication lag (Option A).** ClickHouse is eventually consistent. A row may appear seconds/minutes after
  the scrape. The cursor model tolerates this; you just process it on a later cycle.
- **Re-activations not enqueued** (see §3). Don't assume the queue captures "offer came back".
- **Restaurant renamed / offer edited.** The queue snapshots `title`/`description` at enqueue time; if you
  prefer live values, re-read from the replica at send time.
- **Backlog on first run.** When you first deploy, `last_processed_queue_id` starts at 0 and the queue may
  already hold a backlog. Decide whether to (a) send for the whole backlog or (b) seed the cursor to the
  current max id and only notify on offers going forward. **(b) is strongly recommended** to avoid a flood.
- **Retention.** Nobody prunes the queue yet. Agree on a retention policy (e.g. delete rows older than the
  cursor + N days) and who runs it.

---

## 11. App-DB additions Part B will likely need

- `notification_cursor` (or a settings row): `last_processed_queue_id BIGINT`.
- _(optional, for exactly-once)_ `notification_sent(user_id, max_queue_id, sent_at)`.
- Email transport config (env).

These live in `marketing-offers-tool`'s Postgres, alongside `user_monitor`.

---

## 12. Verification checklist for Part B

1. Replication: `offer_notification_queue` rows visible in `aggregator_scraper_replica` (Option A) — or a
   read connection to `aggregator_scraper` works (Option B).
2. Seed `last_processed_queue_id` to the current max id (avoid backlog flood) and confirm a no-op first run.
3. Create a `user_monitor { section:'competition', entityId:'<agg>:<rest>' }` for a test user + a restaurant
   you can trigger a new offer for. Trigger a scrape that creates a new offer for that restaurant.
4. Run the digest job → exactly one email to the test user, containing that offer; cursor advances.
5. Run again immediately → no email (nothing new), cursor unchanged.
6. Multi-restaurant: monitor two restaurants, generate a new offer in each, confirm **one** consolidated email.

---

## 13. References

**This repo (producer):**

- `prisma/schema.prisma` — `OfferNotificationQueue` model.
- `db/persist-scrape.ts` — `persistScrapeContext`, enqueue logic in the offer-upsert loop.
- `providers/contracts.ts` — `PipelinePersistence.newOfferCount`.
- Migration `prisma/migrations/20260608132150_add_offer_notification_queue/`.

**marketing-offers-tool (consumer):**

- `src/lib/services/user-monitor.server.ts` — `user_monitor` access patterns.
- `src/lib/server/competition-db.ts` — `competitionTable()`, `getCompetitionDatabase()` (`aggregator_scraper_replica`).
- `src/lib/server/clickhouse.ts` — ClickHouse client.
- `src/routes/competition/restaurants/+page.svelte` — where `entityId` is constructed.
- `prisma/schema.prisma` — `user_monitor`, `MonitorSection`, `user`.
