import { requireSuperUser } from "$lib/server/auth-guards";
import { getScrapeJobSnapshot } from "$lib/services/competition/scrape-job.server";
import { listScrapeSessionsPage } from "$lib/services/competition/scrape-sessions.server";
import { z } from "zod";
import type { PageServerLoad } from "./$types";

const PAGE_SIZE = 50;

const searchParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
});

export const load: PageServerLoad = async (event) => {
  await requireSuperUser(event);

  const { page } = searchParamsSchema.parse({
    page: event.url.searchParams.get("page") ?? 1,
  });

  return {
    sessionsPage: await listScrapeSessionsPage({
      page,
      pageSize: PAGE_SIZE,
    }),
    scrapeStatus: getScrapeJobSnapshot(),
  };
};
