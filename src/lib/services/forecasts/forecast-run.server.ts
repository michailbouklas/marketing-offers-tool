import { json } from "@sveltejs/kit";
import { getForecastEnv } from "$lib/server/env";
import {
  ForecastError,
  listForecastModels,
  runForecast,
} from "./forecast-engine.server";
import {
  computeHistoryWindow,
  countMissingDays,
  getDailySalesSeries,
  getLatestSalesDate,
} from "./forecast-series.server";
import type {
  ForecastErrorCode,
  ForecastErrorResponse,
  ForecastResult,
} from "./forecast-types";

/**
 * Orchestrates one forecast for one brand and one model: catalog lookup →
 * latest sales date → result cache → ClickHouse series → min-history check →
 * engine run. One model per call so failure, timeout, abort and caching are
 * all per model (the browser fires one request per selected model).
 *
 * The cache key includes the brand's latest sales date, so a new warehouse day
 * invalidates cached results automatically; the TTL bounds staleness when the
 * warehouse is quiet.
 */

export type ForecastRunInput = {
  brandAlias: string;
  brandName: string;
  modelId: string;
  horizonDays: number;
  /** `tran_location` id; null/absent = all locations of the brand. */
  locationId?: number | null;
  /** Display name for messages/results (resolved by the caller). */
  locationName?: string | null;
};

type CacheEntry = { at: number; result: ForecastResult };

/** Upper bound on cached results (brand × model × horizon × cutoff). */
export const FORECAST_RUN_CACHE_MAX_ENTRIES = 200;

const resultCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ForecastResult>>();

/** Test helper — drops the result cache and in-flight map. */
export function __clearForecastRunCache(): void {
  resultCache.clear();
  inFlight.clear();
}

function cacheKey(input: ForecastRunInput, latestSalesDate: string): string {
  const location = input.locationId ?? "all";
  return `${input.brandAlias.trim().toLowerCase()}|${location}|${input.modelId}|${input.horizonDays}|${latestSalesDate}`;
}

function storeResult(key: string, at: number, result: ForecastResult): void {
  // Delete-then-set moves an existing key to the end so eviction (first key)
  // is oldest-written.
  resultCache.delete(key);
  while (resultCache.size >= FORECAST_RUN_CACHE_MAX_ENTRIES) {
    const oldest = resultCache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    resultCache.delete(oldest);
  }
  resultCache.set(key, { at, result });
}

export async function getForecastForBrand(
  input: ForecastRunInput,
  options: { now?: number } = {},
): Promise<ForecastResult> {
  const now = options.now ?? Date.now();
  const env = getForecastEnv();
  const locationId = input.locationId ?? null;
  const locationName = input.locationName?.trim() || null;
  const brandLabel =
    (input.brandName.trim() || input.brandAlias) +
    (locationId !== null
      ? ` — ${locationName ?? `location ${locationId}`}`
      : "");

  const models = await listForecastModels({ now });
  const model = models.find((candidate) => candidate.id === input.modelId);
  if (!model) {
    throw new ForecastError(
      "UNKNOWN_MODEL",
      `Unknown forecast model "${input.modelId}".`,
    );
  }

  const latestSalesDate = await getLatestSalesDate(input.brandAlias, {
    now: new Date(now),
    locationId,
  });
  if (latestSalesDate === null) {
    throw new ForecastError(
      "NO_SALES_DATA",
      `No sales were found for ${brandLabel} in the last ${env.FORECAST_HISTORY_DAYS} days.`,
      { details: { brandAlias: input.brandAlias, locationId } },
    );
  }

  const key = cacheKey(input, latestSalesDate);
  const cached = resultCache.get(key);
  if (cached && now - cached.at < env.FORECAST_CACHE_TTL_MS) {
    return { ...cached.result, cached: true };
  }

  const pending = inFlight.get(key);
  if (pending) {
    return pending;
  }

  const run = (async (): Promise<ForecastResult> => {
    const window = computeHistoryWindow(
      latestSalesDate,
      env.FORECAST_HISTORY_DAYS,
    );
    const series = await getDailySalesSeries({
      brandAlias: input.brandAlias,
      ...window,
      locationId,
    });

    if (series.length < model.minHistoryDays) {
      throw new ForecastError(
        "INSUFFICIENT_HISTORY",
        `${brandLabel} has ${series.length} ${series.length === 1 ? "day" : "days"} of sales history; ${model.name} needs at least ${model.minHistoryDays}.`,
        {
          details: {
            historyDays: series.length,
            minHistoryDays: model.minHistoryDays,
            modelId: model.id,
          },
        },
      );
    }

    const engineResult = await runForecast({
      modelId: model.id,
      horizonDays: input.horizonDays,
      country: env.FORECAST_DEFAULT_COUNTRY,
      backtestFolds: 1,
      seriesLabel:
        locationId === null
          ? input.brandAlias
          : `${input.brandAlias}@${locationId}`,
      series: series.map((point) => ({
        ds: point.ds,
        y: point.revenue,
        orders: point.orders,
      })),
    });

    const result: ForecastResult = {
      ...engineResult,
      brandAlias: input.brandAlias,
      brandName: input.brandName,
      cached: false,
      missingDays: countMissingDays(series, window),
      locationId,
      locationName,
    };

    storeResult(key, now, result);
    return result;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, run);
  return run;
}

// ---------------------------------------------------------------------------
// HTTP mapping shared by the /api/forecasts/* routes
// ---------------------------------------------------------------------------

export function forecastErrorStatus(code: ForecastErrorCode): number {
  switch (code) {
    case "BAD_REQUEST":
      return 400;
    case "FORBIDDEN":
      return 403;
    case "UNKNOWN_MODEL":
      return 404;
    case "INSUFFICIENT_HISTORY":
    case "NO_SALES_DATA":
      return 422;
    case "ENGINE_REJECTED":
    case "INVALID_RESPONSE":
      return 502;
    case "ENGINE_UNAVAILABLE":
    case "NOT_CONFIGURED":
      return 503;
    case "ENGINE_TIMEOUT":
      return 504;
    default:
      return 500;
  }
}

/** `{ error: { code, message, details? } }` with the status from `forecastErrorStatus`. */
export function forecastErrorResponse(err: ForecastError): Response {
  const body: ForecastErrorResponse = {
    error: {
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    },
  };

  return json(body, { status: forecastErrorStatus(err.code) });
}
