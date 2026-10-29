import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { requireApiAdminPermission } from "$lib/server/auth-guards";
import { hasMailTransport } from "$lib/server/notifications/notifications-env";
import {
  notifyUsersOfRelease,
  ReleaseNotFoundError,
} from "$lib/services/releases/release-notify.server";
import { notifyReleaseRequestSchema } from "$lib/services/releases/releases";
import type { RequestHandler } from "./$types";

const idSchema = z.coerce.number().int().positive();

/**
 * Email the release notes to the selected users. superUser only
 * (`release: ["manage"]`). Returns per-recipient outcome; partial failures are
 * a 200 with `failed` populated so the dialog can offer a retry.
 */
export const POST: RequestHandler = async (event) => {
  await requireApiAdminPermission(event, { release: ["manage"] });

  const id = idSchema.safeParse(event.params.id);
  if (!id.success) {
    error(400, "Invalid release id.");
  }

  let payload: unknown;
  try {
    payload = await event.request.json();
  } catch {
    error(400, "Invalid JSON body.");
  }

  const parsed = notifyReleaseRequestSchema.safeParse(payload);
  if (!parsed.success) {
    error(400, "Expected { userIds: string[] } with at least one id.");
  }

  if (!hasMailTransport()) {
    error(
      503,
      "Email is not configured (SMTP_HOST / NOTIFICATIONS_FROM_EMAIL).",
    );
  }

  try {
    const result = await notifyUsersOfRelease({
      releaseId: id.data,
      userIds: parsed.data.userIds,
    });
    return json(result);
  } catch (caught) {
    if (caught instanceof ReleaseNotFoundError) {
      error(404, "Release not found.");
    }
    throw caught;
  }
};
