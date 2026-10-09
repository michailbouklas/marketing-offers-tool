import { json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import { FORECASTS_PERMISSION } from "$lib/services/forecasts/forecast-scope.server";
import { getLatestForecastValidationBatch } from "$lib/services/forecasts/forecast-validation-query.server";
import {
  getLastForecastValidationRecord,
  isForecastValidationEvaluateInFlight,
  isForecastValidationRecordInFlight,
} from "$lib/services/forecasts/forecast-validation.server";
import type { RequestHandler } from "./$types";

/**
 * GET /api/forecasts/validation/status — polled by the admin card on
 * /forecasts/validation while a recording run is in flight.
 */
export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, FORECASTS_PERMISSION);

  return json({
    recordInFlight: isForecastValidationRecordInFlight(),
    evaluateInFlight: isForecastValidationEvaluateInFlight(),
    lastRecord: getLastForecastValidationRecord(),
    latestBatch: await getLatestForecastValidationBatch(),
  });
};
