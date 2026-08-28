import {
  getForecastGateway,
  setForecastGateway,
  type ForecastGateway,
  type GatewayOutcome,
} from "$lib/server/mastra/tools/forecast-gateway";
import {
  isForecastError,
  listForecastModels,
} from "$lib/services/forecasts/forecast-engine.server";
import { getForecastForBrand } from "$lib/services/forecasts/forecast-run.server";
import {
  getLocationHistoryCoverage,
  getSalesHistorySummary,
  listBrandLocations,
} from "$lib/services/forecasts/forecast-series.server";

/**
 * SvelteKit-side implementation of the forecast tools' gateway
 * (`src/lib/server/mastra/tools/forecast-gateway.ts`). Wraps the Sales
 * Forecasts services — catalog cache, ClickHouse series, the engine client
 * with its result cache and in-flight dedupe — and flattens their typed
 * `ForecastError`s into plain, serialisable outcomes the tools can hand to
 * the model.
 *
 * Lives outside `src/lib/server/mastra/` on purpose: the services it wraps
 * import `$lib/server/env` / `$lib/server/clickhouse` (`$env/dynamic/private`),
 * which that directory must avoid so `mastra dev` can bundle it — the same
 * reason `brand-scope.server.ts` sits here. Installed once from
 * `src/hooks.server.ts`; nothing here touches env at import time, so
 * importing it during `vite build` is harmless.
 */

async function attempt<T>(task: () => Promise<T>): Promise<GatewayOutcome<T>> {
  try {
    return { ok: true, value: await task() };
  } catch (cause) {
    if (isForecastError(cause)) {
      return {
        ok: false,
        error: {
          code: cause.code,
          message: cause.message,
          retryable: cause.retryable,
          ...(cause.details ? { details: cause.details } : {}),
        },
      };
    }

    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`[forecast-gateway] ${message}`);
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: "The forecast could not be produced. Try again in a moment.",
        retryable: true,
      },
    };
  }
}

export function createForecastGateway(): ForecastGateway {
  return {
    listModels: () => attempt(() => listForecastModels()),

    listLocations: (brandAlias) =>
      attempt(() => listBrandLocations(brandAlias)),

    getBrandCoverage: (brandAlias, locationId) =>
      attempt(async () => {
        const summary = await getSalesHistorySummary(brandAlias, {
          recentDays: 0,
          locationId,
        });
        return summary
          ? {
              latestSalesDate: summary.latestSalesDate,
              historyDays: summary.historyDays,
            }
          : null;
      }),

    getLocationCoverage: (brandAlias) =>
      attempt(() => getLocationHistoryCoverage(brandAlias)),

    runForecast: (input) =>
      attempt(() =>
        getForecastForBrand({
          brandAlias: input.brandAlias,
          brandName: input.brandName,
          modelId: input.modelId,
          horizonDays: input.horizonDays,
          locationId: input.locationId,
          locationName: input.locationName,
        }),
      ),
  };
}

/** Idempotent: keeps an already-installed gateway (dev HMR, tests). */
export function installForecastGateway(): void {
  if (!getForecastGateway()) {
    setForecastGateway(createForecastGateway());
  }
}
