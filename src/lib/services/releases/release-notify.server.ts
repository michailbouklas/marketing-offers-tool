import { prisma } from "$lib/server/prisma";
import { getPublicBaseUrl } from "$lib/server/env";
import { sendEmail } from "$lib/server/mailer.server";
import { buildReleaseEmail } from "./release-email.server";
import { getReleaseDetail, ReleaseNotFoundError } from "./releases.server";
import type { ReleaseNotifyResult, ReleaseRecipient } from "./releases";

/**
 * Server-only "notify users" for release notes: the recipient list for the
 * dialog and the per-user send loop. One email per recipient (never a BCC
 * blast), sequential, with per-recipient failures captured so the caller can
 * report exactly who did not get it.
 */

/** Only usable accounts: banned users are never offered or mailed. */
function activeUserWhere() {
  return { OR: [{ banned: false }, { banned: null }] };
}

export async function listReleaseRecipients(): Promise<ReleaseRecipient[]> {
  const rows = await prisma.user.findMany({
    where: activeUserWhere(),
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name.trim() || null,
    email: row.email,
  }));
}

// Shared with `updateRelease`; re-exported so existing imports keep working.
export { ReleaseNotFoundError };

export async function notifyUsersOfRelease(input: {
  releaseId: number;
  userIds: string[];
}): Promise<ReleaseNotifyResult> {
  const release = await getReleaseDetail(input.releaseId);
  if (!release) {
    throw new ReleaseNotFoundError(input.releaseId);
  }

  const uniqueIds = [...new Set(input.userIds)];
  // Re-resolve server-side so a stale client list can never mail a banned or
  // deleted account.
  const recipients = await prisma.user.findMany({
    where: { ...activeUserWhere(), id: { in: uniqueIds } },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  const email = buildReleaseEmail(release, { appUrl: getPublicBaseUrl() });
  const failed: ReleaseNotifyResult["failed"] = [];
  let sent = 0;

  for (const recipient of recipients) {
    try {
      await sendEmail({ to: recipient.email, ...email });
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[releases] notify failed for ${recipient.email} (release ${release.id}):`,
        error,
      );
      failed.push({
        userId: recipient.id,
        email: recipient.email,
        error: message,
      });
    }
  }

  return {
    releaseId: release.id,
    sent,
    failed,
    skipped: uniqueIds.length - recipients.length,
  };
}
