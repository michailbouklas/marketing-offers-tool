import { isHttpError, json } from "@sveltejs/kit";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import {
  ForecastError,
  isForecastError,
} from "$lib/services/forecasts/forecast-engine.server";
import { forecastErrorResponse } from "$lib/services/forecasts/forecast-run.server";
import { resolveForecastBrand } from "$lib/services/forecasts/forecast-scope.server";
import { listBrandLocations } from "$lib/services/forecasts/forecast-series.server";
import {
  forecastLocationsRequestSchema,
  type ForecastLocationsResponse,
} from "$lib/services/forecasts/forecast-types";
import type { RequestHandler } from "./$types";

/**
 * GET /api/forecasts/locations?brand=<alias> — the brand's locations
 * (`tran_location` + `location_name`) that recorded sales inside the forecast
 * lookback window. Populates the location filter once a brand is selected.
 *
 * 400 bad query · 401/403 from the guard (403 as a typed envelope).
 */
export const GET: RequestHandler = async (event) => {
  requireAuthenticatedApiUser(event);

  const parsed = forecastLocationsRequestSchema.safeParse({
    brand: event.url.searchParams.get("brand") ?? undefined,
  });
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
    const { brand } = await resolveForecastBrand(event, parsed.data.brand, {
      guard: "api",
    });
    if (!brand) {
      return forecastErrorResponse(
        new ForecastError("BAD_REQUEST", "brand is required."),
      );
    }

    const body: ForecastLocationsResponse = {
      brandAlias: brand.alias,
      locations: await listBrandLocations(brand.alias),
    };
    return json(body);
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

    console.error("[forecasts] GET /api/forecasts/locations failed", err);
    return forecastErrorResponse(
      new ForecastError("INTERNAL", "Could not load the brand's locations."),
    );
  }
};
