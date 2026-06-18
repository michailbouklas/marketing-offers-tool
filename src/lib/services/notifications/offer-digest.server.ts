import { env } from "$env/dynamic/private";
import { Client } from "pg";
import { prisma } from "$lib/server/prisma";
import {
  getNotificationsEnv,
  hasNotificationsTransport,
  hasQueueSource,
} from "$lib/server/notifications/notifications-env";
import { getRestaurantNames, readQueueBatch } from "$lib/server/scraper-db";
import { sendDigestEmail } from "$lib/server/mailer.server";
import { getMonitorUsersByEntityIds } from "$lib/services/user-monitor.server";
import { advanceCursor, getCursor, peekCursor } from "./digest-cursor.server";
import { buildDigestEmail } from "./digest-email.server";
import type { DigestRunSummary, QueueRow } from "./types";

/**
 * Offer-notification digest (Part B consumer). On each run it reads new
 * `offer_notification_queue` rows from the scraper Postgres since the stored
 * cursor, matches them to users who monitor the restaurant, consolidates all of
 * a user's new offers into ONE email, sends it, and advances the cursor.
 *
 * Delivery is **at-least-once** (cursor only, no per-user ledger). The cursor is
 * advanced per-batch after sends so a crash mid-run re-sends at most one batch
 * on the next cycle. See `docs/specs/notifications/instructions.md`.
 */

// Two arbitrary int4 constants identifying the session advisory lock that
// serialises digest runs across processes/connections (the two-arg form avoids
// overload ambiguity with the single-bigint variant).
const LOCK_KEY_1 = 0x4f66_4e74 | 0; // "OfNt"
const LOCK_KEY_2 = 0x44_69_67_73 | 0; // "Digs"

interface DigestLock {
  release(): Promise<void>;
}

/**
 * Try to take the cross-process digest lock on a dedicated app-DB connection
 * held for the whole run (a pooled connection could not safely hold a session
 * lock). Returns null when another run already holds it. If the process dies,
 * Postgres releases the lock automatically when the connection drops.
 */
async function tryAcquireDigestLock(): Promise<DigestLock | null> {
  const connectionString = env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1, $2) AS locked",
      [LOCK_KEY_1, LOCK_KEY_2],
    );

    if (!result.rows[0]?.locked) {
      await client.end();
      return null;
    }

    return {
      async release() {
        try {
          await client.query("SELECT pg_advisory_unlock($1, $2)", [
            LOCK_KEY_1,
            LOCK_KEY_2,
          ]);
        } finally {
          await client.end();
        }
      },
    };
  } catch (error) {
    await client.end();
    throw error;
  }
}

function emptySummary(
  ran: boolean,
  newCursor: number,
  reason?: string,
): DigestRunSummary {
  return {
    ran,
    reason,
    processedRows: 0,
    usersEmailed: 0,
    emailsFailed: 0,
    newCursor,
  };
}

/** Build the per-user buckets for a batch: every monitoring user gets the row. */
function consolidatePerUser(
  rows: QueueRow[],
  usersByEntityKey: Map<string, string[]>,
): Map<string, QueueRow[]> {
  const perUser = new Map<string, QueueRow[]>();

  for (const row of rows) {
    const userIds = usersByEntityKey.get(row.entityKey);

    if (!userIds) {
      continue;
    }

    for (const userId of userIds) {
      const bucket = perUser.get(userId);

      if (bucket) {
        bucket.push(row);
      } else {
        perUser.set(userId, [row]);
      }
    }
  }

  return perUser;
}

/**
 * Process one batch: match → consolidate → resolve names/emails → send.
 * Returns counts plus whether every attempted send failed (transport likely
 * down), so the caller can decide whether to advance the cursor.
 */
async function processBatch(
  rows: QueueRow[],
  dryRun: boolean,
): Promise<{
  usersEmailed: number;
  emailsFailed: number;
  attemptedSends: number;
}> {
  const entityKeys = [...new Set(rows.map((row) => row.entityKey))];
  const usersByEntityKey = await getMonitorUsersByEntityIds(entityKeys);
  const perUser = consolidatePerUser(rows, usersByEntityKey);

  if (perUser.size === 0) {
    // New offers, but nobody monitors those restaurants — nothing to send.
    return { usersEmailed: 0, emailsFailed: 0, attemptedSends: 0 };
  }

  const restaurantIds = [...new Set(rows.map((row) => row.restaurantId))];
  const [restaurantNames, users] = await Promise.all([
    getRestaurantNames(restaurantIds),
    prisma.user.findMany({
      where: { id: { in: [...perUser.keys()] } },
      select: { id: true, email: true },
    }),
  ]);

  const emailByUserId = new Map(users.map((user) => [user.id, user.email]));

  let usersEmailed = 0;
  let emailsFailed = 0;
  let attemptedSends = 0;

  for (const [userId, userRows] of perUser) {
    const email = emailByUserId.get(userId)?.trim();

    if (!email) {
      continue;
    }

    attemptedSends += 1;
    const { subject, html, text } = buildDigestEmail(userRows, restaurantNames);

    if (dryRun) {
      usersEmailed += 1;
      console.info(
        `[notifications][dry-run] would email ${email} (user ${userId}): "${subject}" — ${userRows.length} offer(s).`,
      );
      continue;
    }

    try {
      await sendDigestEmail({ to: email, subject, html, text });
      usersEmailed += 1;
    } catch (error) {
      emailsFailed += 1;
      console.error(
        `[notifications] failed to send digest to user ${userId}:`,
        error,
      );
    }
  }

  return { usersEmailed, emailsFailed, attemptedSends };
}

/**
 * Run one digest cycle. Safe to call from the scheduler or the manual-trigger
 * route; concurrent runs are serialised by an advisory lock and the caller's
 * in-memory run-lock.
 */
export async function runOfferDigest(
  options: { dryRun?: boolean } = {},
): Promise<DigestRunSummary> {
  const dryRun = options.dryRun ?? false;

  // A dry run reads + matches but never sends, so it only needs the queue
  // source; a real run also needs the SMTP transport.
  if (dryRun ? !hasQueueSource() : !hasNotificationsTransport()) {
    console.warn(
      dryRun
        ? "[notifications] dry run skipped: NOTIFICATIONS_ENABLED and SCRAPER_DATABASE_URL must be set."
        : "[notifications] digest skipped: NOTIFICATIONS_ENABLED, SCRAPER_DATABASE_URL, SMTP_HOST and NOTIFICATIONS_FROM_EMAIL must all be set.",
    );
    return emptySummary(false, 0, "configuration incomplete");
  }

  const lock = await tryAcquireDigestLock();

  if (!lock) {
    console.warn("[notifications] digest skipped: another run is in progress.");
    return emptySummary(false, 0, "another run in progress");
  }

  try {
    // A dry run previews from the existing cursor without seeding or advancing
    // it, so it never mutates state. A real run seeds the cursor to MAX(id) on
    // first ever run and treats that cycle as a no-op (no backlog flood).
    let currentCursor: number;

    if (dryRun) {
      currentCursor = await peekCursor();
    } else {
      const cursor = await getCursor();

      if (cursor.seeded) {
        console.info(
          `[notifications] first run — seeded cursor to ${cursor.value}, no digest sent.`,
        );
        return emptySummary(false, cursor.value, "seeded cursor on first run");
      }

      currentCursor = cursor.value;
    }

    const batchSize = getNotificationsEnv().NOTIFICATIONS_BATCH_SIZE;

    let processedRows = 0;
    let usersEmailed = 0;
    let emailsFailed = 0;

    // Drain the queue batch by batch, advancing the cursor after each batch.
    for (;;) {
      const rows = await readQueueBatch(currentCursor, batchSize);

      if (rows.length === 0) {
        break;
      }

      const maxIdInBatch = rows[rows.length - 1].id;
      const result = await processBatch(rows, dryRun);

      usersEmailed += result.usersEmailed;
      emailsFailed += result.emailsFailed;
      processedRows += rows.length;

      // Advance unless every attempted send failed (transport likely down) —
      // then leave the cursor so this id range is retried next cycle. A batch
      // with no recipients still advances. A single bad recipient must not pin
      // the cursor and re-spam everyone, so partial failure still advances.
      const transportDown =
        result.attemptedSends > 0 &&
        result.emailsFailed === result.attemptedSends;

      if (transportDown) {
        console.error(
          "[notifications] all sends in batch failed — not advancing cursor; will retry next cycle.",
        );
        break;
      }

      // A dry run never writes the cursor; it just walks forward in memory.
      if (!dryRun) {
        await advanceCursor(maxIdInBatch);
      }
      currentCursor = maxIdInBatch;

      if (rows.length < batchSize) {
        break;
      }
    }

    return {
      ran: true,
      processedRows,
      usersEmailed,
      emailsFailed,
      newCursor: currentCursor,
    };
  } finally {
    await lock.release();
  }
}
