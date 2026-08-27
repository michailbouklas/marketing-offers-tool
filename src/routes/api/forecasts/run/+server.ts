import { isHttpError, json } from "@sveltejs/kit";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import {
  ForecastError,
  isForecastError,
} from "$lib/services/forecasts/forecast-engine.server";
import {
  forecastErrorResponse,
  getForecastForBrand,
} from "$lib/services/forecasts/forecast-run.server";
import { resolveForecastBrand } from "$lib/services/forecasts/forecast-scope.server";
import { forecastRunRequestSchema } from "$lib/services/forecasts/forecast-types";
import type { RequestHandler } from "./$types";

/**
 * POST /api/forecasts/run — body `{ brandAlias, modelId, horizonDays }`.
 * Runs ONE model for ONE brand so failure, timeout, abort and cache are per
 * model; the browser fires one request per selected model.
 *
 * 400 malformed body · 401 no session · 403 no permission / brand out of
 * scope (typed envelope) · `ForecastError` → status map in
 * `forecastErrorStatus` · anything else → 500 generic envelope.
 */
export const POST: RequestHandler = async (event) => {
  requireAuthenticatedApiUser(event);

  let raw: unknown;
  try {
    raw = await event.request.json();
  } catch {
    return forecastErrorResponse(
      new ForecastError("BAD_REQUEST", "Expected a JSON body."),
    );
  }

  const parsed = forecastRunRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return forecastErrorResponse(
      new ForecastError(
        "BAD_REQUEST",
        parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      ),
    );
  }

  try {
    const { brand } = await resolveForecastBrand(
      event,
      parsed.data.brandAlias,
      {
        guard: "api",
      },
    );
    if (!brand) {
      return forecastErrorResponse(
        new ForecastError("BAD_REQUEST", "brandAlias is required."),
      );
    }

    const result = await getForecastForBrand({
      brandAlias: brand.alias,
      brandName: brand.name,
      modelId: parsed.data.modelId,
      horizonDays: parsed.data.horizonDays,
    });

    return json(result);
  } catch (err) {
    if (isForecastError(err)) {
      return forecastErrorResponse(err);
    }
    if (isHttpError(err) && err.status === 403) {
      return forecastErrorResponse(
        new ForecastError("FORBIDDEN", err.body.message),
      );
    }
    if (isHttpError(err)) {
      throw err;
    }

    console.error("[forecasts] POST /api/forecasts/run failed", {
      modelId: parsed.data.modelId,
      horizonDays: parsed.data.horizonDays,
      error: err,
    });
    return forecastErrorResponse(
      new ForecastError("INTERNAL", "The forecast could not be computed."),
    );
  }
};
