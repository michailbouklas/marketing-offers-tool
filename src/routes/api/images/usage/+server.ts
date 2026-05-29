import { json } from "@sveltejs/kit";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { getGeneratedImageUsageByDayForUser } from "$lib/services/image-generator/image-generator.server";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);
  const points = await getGeneratedImageUsageByDayForUser(user.id);
  return json({ points });
};
