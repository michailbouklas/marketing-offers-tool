import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { message, superValidate } from "sveltekit-superforms/server";
import { zod4 } from "sveltekit-superforms/adapters";
import { requirePermission } from "$lib/server/auth-guards";
import {
  createUrlToScrape,
  createUrlsToScrape,
  listUrlsToScrape,
} from "$lib/services/urls-to-scrape.server";
import { type Aggregator } from "$lib/services/aggregator-offers";
import {
  type UrlToScrapeActionMessage,
  bulkUrlToScrapeSchema,
  getDefaultUrlToScrapeFormData,
  urlToScrapeFormSchema,
} from "$lib/services/urls-to-scrape-form";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { urlsToScrape: ["manage"] });

  const [createForm, urls] = await Promise.all([
    superValidate(
      getDefaultUrlToScrapeFormData(),
      zod4(urlToScrapeFormSchema),
      {
        errors: false,
        id: "create-url",
      },
    ),
    listUrlsToScrape(),
  ]);

  return { createForm, urls };
};

export const actions: Actions = {
  createUrl: async (event) => {
    const { user } = await requirePermission(event, {
      urlsToScrape: ["manage"],
    });

    const formData = await event.request.formData();
    const form = await superValidate(formData, zod4(urlToScrapeFormSchema), {
      id: "create-url",
    });

    if (!form.valid) {
      return fail(400, { form });
    }

    if (!user) {
      return fail(401, { form });
    }

    const { created } = await createUrlToScrape({
      url: form.data.url,
      aggregator: form.data.aggregator as Aggregator,
      userId: user.id,
    });

    return message<UrlToScrapeActionMessage>(form, {
      text: created
        ? "URL added."
        : "That URL is already registered — skipped.",
    });
  },

  bulkCreateUrls: async (event) => {
    const { user } = await requirePermission(event, {
      urlsToScrape: ["manage"],
    });

    const formData = await event.request.formData();
    const rawPayload = formData.get("payload")?.toString() ?? "";

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawPayload);
    } catch {
      return fail(400, { bulkError: "Could not read the submitted URLs." });
    }

    const parsed = bulkUrlToScrapeSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return fail(400, {
        bulkError: "Every URL must be valid and have an aggregator selected.",
      });
    }

    if (!user) {
      return fail(401, { bulkError: "Not authenticated." });
    }

    const { added, skipped } = await createUrlsToScrape(parsed.data, user.id);

    return { bulkAdded: added, bulkSkipped: skipped };
  },
};
