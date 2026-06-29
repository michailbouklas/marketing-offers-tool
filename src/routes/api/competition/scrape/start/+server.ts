import { error, json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import {
  ScrapeAlreadyRunningError,
  ScrapeConfigError,
  startScrape,
} from "$lib/services/competition/scrape-job.server";
import { z } from "zod";
import type { RequestHandler } from "./$types";

const startBodySchema = z
  .object({
    mode: z.enum(["all", "single"]),
    url: z.string().url().optional(),
    language: z.enum(["en", "el"]).optional(),
  })
  .refine((value) => value.mode !== "single" || Boolean(value.url), {
    message: "A restaurant URL is required for single-URL scrapes.",
    path: ["url"],
  });

export const POST: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, {
    urlsToScrape: ["manage"],
  });

  let raw: unknown;
  try {
    raw = await event.request.json();
  } catch {
    error(400, "Expected JSON body");
  }

  const parsed = startBodySchema.safeParse(raw);
  if (!parsed.success) {
    error(400, parsed.error.issues.map((issue) => issue.message).join("; "));
  }

  try {
    const snapshot = startScrape({
      mode: parsed.data.mode,
      url: parsed.data.url,
      language: parsed.data.language,
      userId: user.id,
    });
    return json(snapshot);
  } catch (e) {
    if (e instanceof ScrapeAlreadyRunningError) {
      error(409, e.message);
    }
    if (e instanceof ScrapeConfigError) {
      error(503, e.message);
    }
    throw e;
  }
};
