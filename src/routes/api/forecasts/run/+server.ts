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
import { listBrandLocations } from "$lib/services/forecasts/forecast-series.server";
import { forecastRunRequestSchema } from "$lib/services/forecasts/forecast-types";
import type { RequestHandler } from "./$types";

/**
 * POST /api/forecasts/run — body `{ brandAlias, modelId, horizonDays,
 * locationId? }`. Runs ONE model for ONE brand (optionally one of its
 * locations) so failure, timeout, abort and cache are per model; the browser
 * fires one request per selected model. A `locationId` must belong to the
 * brand (400 otherwise) — the location list itself is brand-scoped.
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

    const locationId = parsed.data.locationId ?? null;
    let locationName: string | null = null;
    if (locationId !== null) {
      const locations = await listBrandLocations(brand.alias);
      const location = locations.find((entry) => entry.id === locationId);
      if (!location) {
        return forecastErrorResponse(
          new ForecastError(
            "BAD_REQUEST",
            `Location ${locationId} is not a location of ${brand.name || brand.alias}.`,
          ),
        );
      }
      locationName = location.name;
    }

    const result = await getForecastForBrand({
      brandAlias: brand.alias,
      brandName: brand.name,
      modelId: parsed.data.modelId,
      horizonDays: parsed.data.horizonDays,
      locationId,
      locationName,
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
      locationId: parsed.data.locationId ?? null,
      error: err,
    });
    return forecastErrorResponse(
      new ForecastError("INTERNAL", "The forecast could not be computed."),
    );
  }
};
