import { error, json } from "@sveltejs/kit";
import {
  hasSuperUserRole,
  requireAuthenticatedApiUser,
} from "$lib/server/auth-guards";
import { getGeneratedImageUsageByDayForUser } from "$lib/services/image-generator/image-generator.server";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);

  // Super users may request another user's usage (the admin drill-down page);
  // everyone else only ever sees their own.
  const requestedUserId = event.url.searchParams.get("userId");
  let targetUserId = user.id;

  if (requestedUserId && requestedUserId !== user.id) {
    if (!(await hasSuperUserRole(event))) {
      error(403, "Forbidden");
    }
    targetUserId = requestedUserId;
  }

  const points = await getGeneratedImageUsageByDayForUser(targetUserId);
  return json({ points });
};
