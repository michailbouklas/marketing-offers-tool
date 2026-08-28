import { error } from "@sveltejs/kit";
import { loadForecastPageContext } from "$lib/services/forecasts/forecast-scope.server";
import { loadForecastPageData } from "../page-data.server";
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

  const context = await loadForecastPageContext(event, models);
  const pageData = await loadForecastPageData(context);

  return {
    brands: context.brands,
    brand: context.brand,
    ...pageData,
    // The deep-dive is single-model by design; the layout keeps the URL's
    // wider selection for its links.
    filters: { ...pageData.filters, models: [model.id] },
    model,
  };
};
