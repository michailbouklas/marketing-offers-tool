import { json } from "@sveltejs/kit";
import { requireApiAdminPermission } from "$lib/server/auth-guards";
import {
  getGeneratedImageUsageByModelByDay,
  parseUsageDateRange,
} from "$lib/services/image-generator/image-generator.server";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  await requireApiAdminPermission(event, { imageGenerator: ["view-usage"] });
  const range = parseUsageDateRange(
    event.url.searchParams.get("from"),
    event.url.searchParams.get("to"),
  );
  const data = await getGeneratedImageUsageByModelByDay(range);
  return json(data);
};
