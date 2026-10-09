import { json } from "@sveltejs/kit";
import { z } from "zod";
import { requireApiAdminPermission } from "$lib/server/auth-guards";
import { getForecastValidationEnv } from "$lib/server/env";
import { FORECASTS_PERMISSION } from "$lib/services/forecasts/forecast-scope.server";
import {
  FORECAST_VALIDATION_MAX_HORIZON_DAYS,
  FORECAST_VALIDATION_MIN_HORIZON_DAYS,
  isForecastValidationRecordInFlight,
  tryRecordForecastValidationExclusively,
} from "$lib/services/forecasts/forecast-validation.server";
import type { RequestHandler } from "./$types";

const bodySchema = z.object({
  days: z
    .number()
    .int()
    .min(FORECAST_VALIDATION_MIN_HORIZON_DAYS)
    .max(FORECAST_VALIDATION_MAX_HORIZON_DAYS)
    .optional(),
});

/**
 * POST /api/forecasts/validation/record — body `{ days? }`. Admin-only
 * "Record forecasts now" button on /forecasts/validation. Recording every
 * brand × model takes seconds per brand, so the run is started detached and
 * the handler answers 202 at once; the page polls `../status` until the run
 * has finished. 409 while a run is already in progress in this process.
 */
export const POST: RequestHandler = async (event) => {
  await requireApiAdminPermission(event, FORECASTS_PERMISSION);

  let raw: unknown = {};
  try {
    const text = await event.request.text();
    raw = text.trim().length > 0 ? JSON.parse(text) : {};
  } catch {
    return json(
      { ok: false, reason: "Expected a JSON body." },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      {
        ok: false,
        reason: parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  }

  if (isForecastValidationRecordInFlight()) {
    return json(
      { ok: false, reason: "a recording run is already in progress" },
      { status: 409 },
    );
  }

  const horizonDays =
    parsed.data.days ??
    getForecastValidationEnv().FORECAST_VALIDATION_DEFAULT_DAYS;

  // Detached: the promise never rejects (see tryRecordForecastValidationExclusively).
  void tryRecordForecastValidationExclusively({
    horizonDays,
    trigger: "manual",
  }).then((result) => {
    if (result.status === "ran") {
      console.info(
        "[forecast-validation] manual recording complete:",
        JSON.stringify({ ...result.summary, outcomes: undefined }),
      );
    } else {
      console.warn(
        `[forecast-validation] manual recording skipped: ${result.reason}`,
      );
    }
  });

  return json({ ok: true, started: true, horizonDays }, { status: 202 });
};
