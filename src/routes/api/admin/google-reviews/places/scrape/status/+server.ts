import { json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import { getScrapeRunsStatus } from "$lib/services/google-reviews-admin/scrape-run.server";
import type { RequestHandler } from "./$types";

/** Current on-demand scrape run (if any) plus the last finished run per place. */
export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, { googleReviews: ["manage"] });
  return json(getScrapeRunsStatus());
};
