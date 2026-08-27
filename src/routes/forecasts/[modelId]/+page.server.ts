import { error } from "@sveltejs/kit";
import { loadForecastPageContext } from "$lib/services/forecasts/forecast-scope.server";
import { loadHistoryDays } from "../history-days.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { models, engineStatus } = await event.parent();

  const model = models.find(
    (candidate) => candidate.id === event.params.modelId,
  );
  if (!model) {
    if (engineStatus === "unavailable") {
      error(503, "The forecast service is unavailable right now.");
    }
    error(404, "Unknown forecast model.");
  }

  const { brands, brand, filters } = await loadForecastPageContext(
    event,
    models,
  );

  return {
    brands,
    brand,
    // The deep-dive is single-model by design; the layout keeps the URL's
    // wider selection for its links.
    filters: { ...filters, models: [model.id] },
    model,
    historyDays: await loadHistoryDays(brand?.alias),
  };
};
