import { Pool } from "pg";
import { getNotificationsEnv } from "$lib/server/notifications/notifications-env";
import type { QueueRow } from "$lib/services/notifications/types";
import { createLazyProxy } from "./lazy-proxy";

/**
 * Read-only connection to the **scraper Postgres** (`aggregator_scraper`), the
 * source of truth for `offer_notification_queue`. This is a second database
 * connection separate from the app's Prisma pool (`src/lib/server/prisma.ts`),
 * resolved from `SCRAPER_DATABASE_URL`. It is used by the offer-notification
 * digest (Part B) only, and is read-only by convention — this module exposes no
 * write helpers.
 *
 * The cross-database join (queue ↔ `user_monitor`) cannot be done in SQL because
 * the two live in different databases; it happens in app code via `entityKey`.
 */

const globalForScraperDb = globalThis as typeof globalThis & {
  scraperPool?: Pool;
  scraperPoolConnectionString?: string;
};

function getConnectionString(): string {
  const connectionString = getNotificationsEnv().SCRAPER_DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "Missing required environment variable: SCRAPER_DATABASE_URL",
    );
  }

  return connectionString;
}

function getScraperPool(): Pool {
  const connectionString = getConnectionString();
  const cached = globalForScraperDb.scraperPool;

  if (
    cached &&
    globalForScraperDb.scraperPoolConnectionString === connectionString
  ) {
    return cached;
  }

  const pool = new Pool({
    connectionString,
    // The digest job is the only consumer and runs serially, so a small pool is
    // plenty. A short connect timeout means a scraper-DB outage fails fast and
    // the cycle is skipped rather than hanging the scheduler.
    max: 3,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });

  globalForScraperDb.scraperPool = pool;
  globalForScraperDb.scraperPoolConnectionString = connectionString;

  return pool;
}

export const scraperPool = createLazyProxy(getScraperPool);

interface RawQueueRow {
  id: number;
  offer_id: number;
  restaurant_id: number;
  aggregator_id: number;
  session_id: number;
  product_id: number | null;
  entity_key: string;
  title: string;
  description: string | null;
  created_at: Date;
}

function mapQueueRow(row: RawQueueRow): QueueRow {
  return {
    id: row.id,
    offerId: row.offer_id,
    restaurantId: row.restaurant_id,
    aggregatorId: row.aggregator_id,
    sessionId: row.session_id,
    productId: row.product_id,
    entityKey: row.entity_key,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
  };
}

/**
 * New queue rows with `id > afterId`, oldest first, capped at `limit`. The
 * caller drains by looping until fewer than `limit` rows come back.
 */
export async function readQueueBatch(
  afterId: number,
  limit: number,
): Promise<QueueRow[]> {
  const result = await getScraperPool().query<RawQueueRow>(
    `SELECT id, offer_id, restaurant_id, aggregator_id, session_id,
            product_id, entity_key, title, description, created_at
     FROM offer_notification_queue
     WHERE id > $1
     ORDER BY id
     LIMIT $2`,
    [afterId, limit],
  );

  return result.rows.map(mapQueueRow);
}

/**
 * Most recent pending queue rows for a set of `entity_key`s (the entities a user
 * monitors), with `id > afterId` (the digest cursor). Newest first, capped at
 * `limit` — this powers the in-app "your unsent notifications" widget, so it
 * shows the latest rather than the oldest. Returns `[]` when no entities are
 * given so the caller can skip a needless query.
 */
export async function readPendingQueueRowsForEntities(
  entityKeys: string[],
  afterId: number,
  limit: number,
): Promise<QueueRow[]> {
  if (entityKeys.length === 0) {
    return [];
  }

  const result = await getScraperPool().query<RawQueueRow>(
    `SELECT id, offer_id, restaurant_id, aggregator_id, session_id,
            product_id, entity_key, title, description, created_at
     FROM offer_notification_queue
     WHERE id > $1 AND entity_key = ANY($2::text[])
     ORDER BY id DESC
     LIMIT $3`,
    [afterId, entityKeys, limit],
  );

  return result.rows.map(mapQueueRow);
}

/**
 * Exact count of pending queue rows for a set of `entity_key`s with
 * `id > afterId`. Drives the sidebar badge, where the total (not the capped
 * list) is what matters. Returns 0 when no entities are given.
 */
export async function countPendingQueueRowsForEntities(
  entityKeys: string[],
  afterId: number,
): Promise<number> {
  if (entityKeys.length === 0) {
    return 0;
  }

  const result = await getScraperPool().query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM offer_notification_queue
     WHERE id > $1 AND entity_key = ANY($2::text[])`,
    [afterId, entityKeys],
  );

  return result.rows[0]?.count ?? 0;
}

/**
 * Highest queue id, or `null` when the queue is empty. Used to seed the cursor
 * on the very first run so the existing backlog is not emailed as a flood.
 */
export async function getMaxQueueId(): Promise<number | null> {
  const result = await getScraperPool().query<{ max_id: number | null }>(
    "SELECT MAX(id) AS max_id FROM offer_notification_queue",
  );

  return result.rows[0]?.max_id ?? null;
}

/**
 * Human-readable restaurant names keyed by `restaurant.id`, fetched from the
 * scraper Postgres in a single query. `entityKey` only carries ids, so the
 * digest email resolves names here. Missing ids are simply absent from the map.
 */
export async function getRestaurantNames(
  ids: number[],
): Promise<Map<number, string>> {
  const names = new Map<number, string>();

  if (ids.length === 0) {
    return names;
  }

  const result = await getScraperPool().query<{ id: number; name: string }>(
    "SELECT id, name FROM restaurant WHERE id = ANY($1::int[])",
    [ids],
  );

  for (const row of result.rows) {
    names.set(row.id, row.name);
  }

  return names;
}
