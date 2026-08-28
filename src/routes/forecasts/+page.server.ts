import { loadForecastPageContext } from "$lib/services/forecasts/forecast-scope.server";
import { loadForecastPageData } from "./page-data.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { models } = await event.parent();
  const context = await loadForecastPageContext(event, models);

  return {
    brands: context.brands,
    brand: context.brand,
    ...(await loadForecastPageData(context)),
  };
};
