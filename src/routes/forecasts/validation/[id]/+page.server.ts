import { error } from "@sveltejs/kit";
import { listForecastModels } from "$lib/services/forecasts/forecast-engine.server";
import { resolveForecastBrand } from "$lib/services/forecasts/forecast-scope.server";
import type { ForecastModel } from "$lib/services/forecasts/forecast-types";
import {
  getForecastValidationRun,
  listSiblingForecastValidationRuns,
} from "$lib/services/forecasts/forecast-validation-query.server";
import type { PageServerLoad } from "./$types";

/**
 * /forecasts/validation/[id] — one recorded run with its daily points. A run
 * outside the caller's brand scope is a 404 (never reveals it exists).
 */
export const load: PageServerLoad = async (event) => {
  const { brands } = await resolveForecastBrand(event, null, {
    guard: "page",
  });
  const brandAliases = brands.map((brand) => brand.alias);

  const id = /^\d+$/.test(event.params.id)
    ? Number.parseInt(event.params.id, 10)
    : Number.NaN;
  const run = await getForecastValidationRun(id, { brandAliases });

  if (!run) {
    error(404, "Validation run not found");
  }

  const [models, siblings] = await Promise.all([
    listForecastModels().catch((err: unknown): ForecastModel[] => {
      console.error(
        "[forecasts] validation run page: model catalog unavailable:",
        err instanceof Error ? err.message : err,
      );
      return [];
    }),
    listSiblingForecastValidationRuns(run),
  ]);

  return { run, siblings, models };
};
