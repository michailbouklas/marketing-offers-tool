import { requirePermission } from "$lib/server/auth-guards";
import {
  getAdminImageUsageOverview,
  parseUsageDateRange,
} from "$lib/services/image-generator/image-generator.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  // /admin hooks gate enforces admin; this additionally requires the usage
  // analytics capability, so an admin without `usageViewer` is redirected.
  await requirePermission(event, { imageGenerator: ["view-usage"] });

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
