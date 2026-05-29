import { json } from "@sveltejs/kit";
import { requireAdminUser } from "$lib/server/auth-guards";
import {
  getGeneratedImageUsageByDayAllUsers,
  parseUsageDateRange,
} from "$lib/services/image-generator/image-generator.server";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  await requireAdminUser(event);
  const range = parseUsageDateRange(
    event.url.searchParams.get("from"),
    event.url.searchParams.get("to"),
  );
  const points = await getGeneratedImageUsageByDayAllUsers(range);
  return json({ points });
};
