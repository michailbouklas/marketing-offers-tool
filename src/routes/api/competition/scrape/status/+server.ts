import { json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import { getScrapeJobSnapshot } from "$lib/services/competition/scrape-job.server";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, { urlsToScrape: ["manage"] });
  return json(getScrapeJobSnapshot());
};
