import { json } from "@sveltejs/kit";
import { requireApiAdminPermission } from "$lib/server/auth-guards";
import { FORECASTS_PERMISSION } from "$lib/services/forecasts/forecast-scope.server";
import {
  isForecastValidationEvaluateInFlight,
  tryEvaluateForecastValidationExclusively,
} from "$lib/services/forecasts/forecast-validation.server";
import type { RequestHandler } from "./$types";

/**
 * POST /api/forecasts/validation/evaluate — admin-only "Evaluate due runs
 * now" button. Same work as the daily cron; runs synchronously (a few
 * seconds at most) and returns the sweep summary. 409 while a sweep is
 * already running here or in another process.
 */
export const POST: RequestHandler = async (event) => {
  await requireApiAdminPermission(event, FORECASTS_PERMISSION);

  if (isForecastValidationEvaluateInFlight()) {
    return json(
      { ok: false, reason: "an evaluation sweep is already in progress" },
      { status: 409 },
    );
  }

  const result = await tryEvaluateForecastValidationExclusively("manual");

  if (result.status === "skipped") {
    return json({ ok: false, reason: result.reason }, { status: 409 });
  }

  return json({ ok: true, summary: result.summary });
};
