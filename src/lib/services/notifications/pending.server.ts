import { getMonitoredEntityIds } from "$lib/services/user-monitor.server";
import { hasQueueSource } from "$lib/server/notifications/notifications-env";
import {
  countPendingQueueRowsForEntities,
  getRestaurantNames,
  readPendingQueueRowsForEntities,
} from "$lib/server/scraper-db";
import { peekCursor } from "./digest-cursor.server";
import type {
  PendingNotification,
  PendingNotificationsResult,
  QueueRow,
} from "./types";

/**
 * In-app read side of the offer-notification digest. Surfaces the offers that
 * are queued for a user but have NOT been emailed yet — i.e. queue rows matching
 * a restaurant the user monitors (`section = 'competition'`) with
 * `queue.id > notification_cursor`. The badge clears naturally once the daily
 * digest emails them and advances the cursor; there is no separate per-user read
 * state.
 *
 * This is strictly read-only: it uses `peekCursor()` (which never seeds or
 * writes), so loading a page can never mutate the digest's send-state, and it
 * touches the read-only scraper Postgres only when the user actually monitors
 * something. Mirrors the cross-database match the digest does in app code, since
 * the queue and `user_monitor` live in separate databases.
 */

/** How many rows the widget lists. The badge `count` is the exact total. */
const PENDING_LIST_LIMIT = 50;

function toPendingNotification(
  row: QueueRow,
  restaurantNames: Map<number, string>,
): PendingNotification {
  return {
    id: row.id,
    offerId: row.offerId,
    restaurantId: row.restaurantId,
    entityKey: row.entityKey,
    title: row.title,
    description: row.description,
    restaurantName: restaurantNames.get(row.restaurantId) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Cheap count of a user's unsent notifications, for the sidebar badge. Resolves
 * to 0 (rather than throwing) when the queue source is not configured, so the
 * caller can render the app shell regardless.
 */
export async function getPendingNotificationCountForUser(
  userId: string,
): Promise<number> {
  if (!hasQueueSource()) {
    return 0;
  }

  const entityIds = [...(await getMonitoredEntityIds(userId, "competition"))];

  if (entityIds.length === 0) {
    return 0;
  }

  const cursor = await peekCursor();

  return countPendingQueueRowsForEntities(entityIds, cursor);
}

/**
 * A user's unsent notifications for the competition dashboard widget: the exact
 * total `count` plus the most recent `items` (capped at {@link
 * PENDING_LIST_LIMIT}), with restaurant names resolved for display.
 */
export async function getPendingNotificationsForUser(
  userId: string,
): Promise<PendingNotificationsResult> {
  if (!hasQueueSource()) {
    return { count: 0, items: [] };
  }

  const entityIds = [...(await getMonitoredEntityIds(userId, "competition"))];

  if (entityIds.length === 0) {
    return { count: 0, items: [] };
  }

  const cursor = await peekCursor();

  const [count, rows] = await Promise.all([
    countPendingQueueRowsForEntities(entityIds, cursor),
    readPendingQueueRowsForEntities(entityIds, cursor, PENDING_LIST_LIMIT),
  ]);

  const restaurantNames = await getRestaurantNames([
    ...new Set(rows.map((row) => row.restaurantId)),
  ]);

  return {
    count,
    items: rows.map((row) => toPendingNotification(row, restaurantNames)),
  };
}
