/**
 * Shared, browser-safe types for the offer-notification digest (Part B). Kept
 * free of server-only imports so the pure email formatter and its unit tests
 * can use them without pulling in `pg`/`$env`.
 */

/**
 * One row of `offer_notification_queue` (scraper Postgres), mapped to camelCase.
 * `id` is the monotonic cursor. `entityKey` is `"${aggregatorId}:${restaurantId}"`
 * and is byte-equal to `user_monitor.entityId` for `section = 'competition'`.
 * `title`/`description` are snapshots taken at enqueue time.
 */
export interface QueueRow {
  id: number;
  offerId: number;
  restaurantId: number;
  aggregatorId: number;
  sessionId: number;
  productId: number | null;
  entityKey: string;
  title: string;
  description: string | null;
  createdAt: Date;
}

/**
 * One pending (not-yet-emailed) offer notification for the in-app surface: a
 * queue row matching a restaurant the viewing user monitors, with
 * `queue.id > notification_cursor`. Browser-safe (used by the dashboard widget),
 * so `createdAt` is an ISO string rather than a `Date`.
 */
export interface PendingNotification {
  id: number;
  offerId: number;
  restaurantId: number;
  entityKey: string;
  title: string;
  description: string | null;
  restaurantName: string | null;
  createdAt: string;
}

/**
 * Pending notifications for one user: the accurate total `count` (drives the
 * sidebar badge) plus the most recent `items` (capped, drives the dashboard
 * widget). `count` may exceed `items.length` when more are pending than the cap.
 */
export interface PendingNotificationsResult {
  count: number;
  items: PendingNotification[];
}

/** Result of one digest run, returned for logging and the manual-trigger route. */
export interface DigestRunSummary {
  /** false when the job was skipped (disabled, no transport, or seeded first run). */
  ran: boolean;
  /** Human-readable reason when `ran` is false. */
  reason?: string;
  processedRows: number;
  usersEmailed: number;
  emailsFailed: number;
  /** Cursor value after the run (the highest queue id processed). */
  newCursor: number;
}
