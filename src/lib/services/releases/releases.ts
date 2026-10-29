import { z } from "zod";

/**
 * Browser-safe contract for the release-notes feature: shared types, the SSE
 * event schema, the API URLs and the pure inbox builder. Server code lives in
 * `releases.server.ts`; the live client store in `$lib/state/release-events.svelte.ts`.
 */

/** `event.depends` / `invalidate` key for the root layout's release inbox. */
export const RELEASES_DEPENDENCY = "app:releases";
/** BroadcastChannel the leader tab fans SSE events out on. */
export const RELEASE_EVENT_CHANNEL = "release-events";
/** Web Lock held by the one tab per browser that owns the EventSource. */
export const RELEASE_EVENT_LOCK = "release-events-leader";
export const RELEASE_STREAM_URL = "/api/releases/stream";
export const RELEASE_READ_URL = "/api/releases/read";

export function releaseDetailUrl(id: number): string {
  return `/api/releases/${id}`;
}

/** superUser-only: users the "Notify users" dialog may email. */
export const RELEASE_RECIPIENTS_URL = "/api/admin/releases/recipients";

export function releaseNotifyUrl(id: number): string {
  return `/api/admin/releases/${id}/notify`;
}

/** superUser-only: AI format pass for the release form body. */
export const RELEASE_FORMAT_URL = "/api/admin/releases/format";

export type ReleaseRecipient = {
  id: string;
  /** Null when the account has no name set. */
  name: string | null;
  email: string;
};

/** Body of `POST /api/admin/releases/[id]/notify`. */
export const notifyReleaseRequestSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(1000),
});

export type NotifyReleaseRequest = z.infer<typeof notifyReleaseRequestSchema>;

export type ReleaseNotifyResult = {
  releaseId: number;
  sent: number;
  failed: { userId: string; email: string; error: string }[];
  /** Ids that did not resolve to an active user (deleted or banned meanwhile). */
  skipped: number;
};

/** Same short date style the admin tables use (`toLocaleDateString`). */
export function formatReleaseDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export type ReleaseSummary = {
  id: number;
  version: string;
  title: string;
  /** ISO timestamp. */
  createdAt: string;
  createdByName: string | null;
};

export type ReleaseInboxItem = ReleaseSummary & { read: boolean };

export type ReleaseDetail = ReleaseSummary & { body: string };

/** What the root layout ships to every signed-in page. */
export type ReleaseInbox = {
  /** Newest first. */
  items: ReleaseInboxItem[];
  unreadCount: number;
  /** Full body of the newest unread release (the login dialog), if any. */
  newestUnread: ReleaseDetail | null;
};

export const EMPTY_RELEASE_INBOX: ReleaseInbox = {
  items: [],
  unreadCount: 0,
  newestUnread: null,
};

const releaseSummarySchema = z.object({
  id: z.number().int().positive(),
  version: z.string(),
  title: z.string(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
});

/** Payload of the `published` SSE frame (also what tabs relay over the BroadcastChannel). */
export const releasePublishedEventSchema = z.object({
  type: z.literal("published"),
  publishedByUserId: z.string(),
  release: releaseSummarySchema,
});

export type ReleasePublishedEvent = z.infer<typeof releasePublishedEventSchema>;

/** Body of `POST /api/releases/read`. */
export const markReleaseReadRequestSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ releaseId: z.number().int().positive() }),
]);

export type MarkReleaseReadRequest = z.infer<
  typeof markReleaseReadRequestSchema
>;

/**
 * Pure: flag each release with this user's read state and pick the newest
 * unread. Sorts newest-first itself so callers need not rely on query order.
 */
export function buildReleaseInboxItems(
  rows: ReleaseSummary[],
  readIds: ReadonlySet<number>,
): {
  items: ReleaseInboxItem[];
  unreadCount: number;
  newestUnreadId: number | null;
} {
  const items = rows
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
    .map((row) => ({ ...row, read: readIds.has(row.id) }));
  const unread = items.filter((item) => !item.read);
  return {
    items,
    unreadCount: unread.length,
    newestUnreadId: unread[0]?.id ?? null,
  };
}
