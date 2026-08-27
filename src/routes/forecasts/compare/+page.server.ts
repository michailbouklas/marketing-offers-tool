import { loadForecastPageContext } from "$lib/services/forecasts/forecast-scope.server";
import { loadHistoryDays } from "../history-days.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { models } = await event.parent();
  const { brands, brand, filters } = await loadForecastPageContext(
    event,
    models,
  );

  return {
    brands,
    brand,
    filters,
    historyDays: await loadHistoryDays(brand?.alias),
  };
};
