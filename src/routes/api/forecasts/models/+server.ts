import { json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import {
  ForecastError,
  isForecastError,
  listForecastModels,
} from "$lib/services/forecasts/forecast-engine.server";
import { forecastErrorResponse } from "$lib/services/forecasts/forecast-run.server";
import { FORECASTS_PERMISSION } from "$lib/services/forecasts/forecast-scope.server";
import type { ForecastModelsResponse } from "$lib/services/forecasts/forecast-types";
import type { RequestHandler } from "./$types";

/**
 * GET /api/forecasts/models — the engine's public model catalog, cached
 * server-side for `FORECAST_MODELS_TTL_MS`. Engine down → 503 envelope.
 */
export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, FORECASTS_PERMISSION);

  try {
    const models = await listForecastModels();
    const body: ForecastModelsResponse = { models };
    return json(body);
  } catch (err) {
    if (isForecastError(err)) {
      return forecastErrorResponse(err);
    }

    console.error("[forecasts] GET /api/forecasts/models failed", err);
    return forecastErrorResponse(
      new ForecastError("INTERNAL", "Could not load the forecast models."),
    );
  }
};
