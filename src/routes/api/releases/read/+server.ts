import { error, json } from "@sveltejs/kit";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { markReleaseReadRequestSchema } from "$lib/services/releases/releases";
import {
  countUnreadReleases,
  markAllReleasesRead,
  markReleaseRead,
} from "$lib/services/releases/releases.server";
import type { RequestHandler } from "./$types";

/**
 * Persist the caller's read state: `{ all: true }` when the announcement
 * dialog is dismissed, `{ releaseId }` when one release is opened from the
 * header list. Responds with the remaining unread count.
 */
export const POST: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);

  let payload: unknown;
  try {
    payload = await event.request.json();
  } catch {
    error(400, "Invalid JSON body.");
  }

  const parsed = markReleaseReadRequestSchema.safeParse(payload);
  if (!parsed.success) {
    error(400, "Expected { all: true } or { releaseId }.");
  }

  if ("all" in parsed.data) {
    await markAllReleasesRead(user.id);
  } else if (!(await markReleaseRead(user.id, parsed.data.releaseId))) {
    error(404, "Release not found.");
  }

  return json({ unreadCount: await countUnreadReleases(user.id) });
};
