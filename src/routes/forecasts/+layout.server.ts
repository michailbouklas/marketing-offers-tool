import { listForecastModels } from "$lib/services/forecasts/forecast-engine.server";
import { resolveForecastBrand } from "$lib/services/forecasts/forecast-scope.server";
import type { ForecastModel } from "$lib/services/forecasts/forecast-types";
import type { LayoutServerLoad } from "./$types";

/**
 * Shared by every `/forecasts` page: permission gate, the user's brand scope
 * and the engine's model catalog. Deliberately ignores `searchParams` so the
 * layout data stays stable while filters change (pages own the filters).
 */
export const load: LayoutServerLoad = async (event) => {
  const { brands } = await resolveForecastBrand(event, null, { guard: "page" });

  let models: ForecastModel[] = [];
  let engineStatus: "ready" | "unavailable" = "ready";
  try {
    models = await listForecastModels();
  } catch (err) {
    console.error(
      "[forecasts] model catalog unavailable:",
      err instanceof Error ? err.message : err,
    );
    engineStatus = "unavailable";
  }

  return { brands, models, engineStatus };
};
