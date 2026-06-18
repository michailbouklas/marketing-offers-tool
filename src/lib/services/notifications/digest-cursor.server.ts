import { prisma } from "$lib/server/prisma";
import { getMaxQueueId } from "$lib/server/scraper-db";

/**
 * Cursor state for the offer-notification digest, stored in the app Postgres
 * (`notification_cursor`, singleton row `id = 1`). Keeping send-state here means
 * we never write back to the scraper database.
 *
 * The queue `id` is a Postgres `int4`, always within `Number.MAX_SAFE_INTEGER`,
 * so the cursor is handled as a JS `number` everywhere except the Prisma edge,
 * where it is converted to/from `BigInt` (the column type).
 */

const CURSOR_ID = 1;

export interface CursorState {
  value: number;
  /** true when this call created the row (first ever run) by seeding to MAX(id). */
  seeded: boolean;
}

/**
 * Current cursor. On the very first run (no row yet) it seeds the cursor to the
 * current `MAX(offer_notification_queue.id)` and reports `seeded: true`, so the
 * caller treats that cycle as a no-op and never floods users with the backlog.
 */
export async function getCursor(): Promise<CursorState> {
  const existing = await prisma.notification_cursor.findUnique({
    where: { id: CURSOR_ID },
  });

  if (existing) {
    return { value: Number(existing.lastProcessedQueueId), seeded: false };
  }

  const maxId = (await getMaxQueueId()) ?? 0;

  await prisma.notification_cursor.create({
    data: { id: CURSOR_ID, lastProcessedQueueId: BigInt(maxId) },
  });

  return { value: maxId, seeded: true };
}

/**
 * Read the cursor without seeding or writing anything. Returns 0 when no cursor
 * row exists yet. Used by dry runs so a preview never mutates state.
 */
export async function peekCursor(): Promise<number> {
  const existing = await prisma.notification_cursor.findUnique({
    where: { id: CURSOR_ID },
  });

  return existing ? Number(existing.lastProcessedQueueId) : 0;
}

/** Advance the cursor to the highest queue id processed so far. */
export async function advanceCursor(toId: number): Promise<void> {
  await prisma.notification_cursor.upsert({
    where: { id: CURSOR_ID },
    update: { lastProcessedQueueId: BigInt(toId) },
    create: { id: CURSOR_ID, lastProcessedQueueId: BigInt(toId) },
  });
}
