import { isHttpError, json } from "@sveltejs/kit";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import {
  ForecastError,
  isForecastError,
} from "$lib/services/forecasts/forecast-engine.server";
import { forecastErrorResponse } from "$lib/services/forecasts/forecast-run.server";
import { resolveForecastBrand } from "$lib/services/forecasts/forecast-scope.server";
import { getSalesHistorySummary } from "$lib/services/forecasts/forecast-series.server";
import {
  forecastHistoryRequestSchema,
  type ForecastHistoryResponse,
} from "$lib/services/forecasts/forecast-types";
import type { RequestHandler } from "./$types";

/**
 * GET /api/forecasts/history?brand=<alias>&days=90 — recent actual sales for
 * one scoped brand plus the count of days with sales in the lookback window.
 * Fetched once per brand by the page: keeps the actuals line visible even when
 * every model fails and drives the "model needs N days" disabling.
 *
 * 400 bad query · 401/403 from the guard (403 as a typed envelope) · 422
 * `NO_SALES_DATA` when the brand has no rows.
 */
export const GET: RequestHandler = async (event) => {
  requireAuthenticatedApiUser(event);

  const parsed = forecastHistoryRequestSchema.safeParse({
    brand: event.url.searchParams.get("brand") ?? undefined,
    days: event.url.searchParams.get("days") ?? undefined,
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

    const summary = await getSalesHistorySummary(brand.alias, {
      recentDays: parsed.data.days,
    });
    if (!summary) {
      return forecastErrorResponse(
        new ForecastError(
          "NO_SALES_DATA",
          `No sales were found for ${brand.name || brand.alias}.`,
        ),
      );
    }

    const body: ForecastHistoryResponse = {
      brandAlias: brand.alias,
      latestSalesDate: summary.latestSalesDate,
      historyDays: summary.historyDays,
      points: summary.points,
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

    console.error("[forecasts] GET /api/forecasts/history failed", err);
    return forecastErrorResponse(
      new ForecastError("INTERNAL", "Could not load the sales history."),
    );
  }
};
