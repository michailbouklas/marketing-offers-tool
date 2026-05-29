import { requireAdminUser } from "$lib/server/auth-guards";
import {
  getAdminImageUsageOverview,
  parseUsageDateRange,
} from "$lib/services/image-generator/image-generator.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requireAdminUser(event);

  const range = parseUsageDateRange(
    event.url.searchParams.get("from"),
    event.url.searchParams.get("to"),
  );

  const overview = await getAdminImageUsageOverview(range);

  return {
    overview,
    range: { from: range?.from ?? null, to: range?.to ?? null },
  };
};
