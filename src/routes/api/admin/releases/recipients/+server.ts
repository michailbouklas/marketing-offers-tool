import { json } from "@sveltejs/kit";
import { requireApiAdminPermission } from "$lib/server/auth-guards";
import { hasMailTransport } from "$lib/server/notifications/notifications-env";
import { listReleaseRecipients } from "$lib/services/releases/release-notify.server";
import type { RequestHandler } from "./$types";

/**
 * Users the "Notify users" dialog can email (banned accounts excluded), plus
 * whether SMTP is configured so the dialog can explain a disabled Notify
 * button instead of failing on send.
 */
export const GET: RequestHandler = async (event) => {
  await requireApiAdminPermission(event, { release: ["manage"] });

  const recipients = await listReleaseRecipients();
  return json({ recipients, mailConfigured: hasMailTransport() });
};
