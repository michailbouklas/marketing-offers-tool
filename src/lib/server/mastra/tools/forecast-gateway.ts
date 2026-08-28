import type {
  ForecastLocation,
  ForecastModel,
  ForecastResult,
} from "../../../services/forecasts/forecast-types";

/**
 * Seam between the forecast tools (this directory) and the Sales Forecasts
 * services in `src/lib/services/forecasts/*.server.ts`.
 *
 * Those services import `$lib/server/env` and `$lib/server/clickhouse`
 * (SvelteKit `$env/dynamic/private`), which nothing under
 * `src/lib/server/mastra/` may import — the directory must stay bundlable by
 * the standalone `mastra dev` playground (see ../env.ts). So the tools only
 * know this interface; the SvelteKit app installs the implementation at
 * server start (`src/lib/server/forecast-gateway.server.ts` from
 * `src/hooks.server.ts`). In the playground no gateway is installed and the
 * tools fail closed with a clear message.
 *
 * Imports here are type-only or relative to pure (zod-only) modules.
 */

/** Plain, serialisable mirror of the app's `ForecastError`. */
export type ForecastGatewayError = {
  code: string;
  message: string;
  /** Whether repeating the same call is likely to succeed. */
  retryable: boolean;
  details?: Record<string, unknown>;
};

export type GatewayOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: ForecastGatewayError };

export type ForecastGatewayRunInput = {
  brandAlias: string;
  brandName: string;
  modelId: string;
  horizonDays: number;
  /** `tran_location` id; null = every location of the brand. */
  locationId: number | null;
  locationName: string | null;
};

/** Sales-history coverage of a brand (or one of its locations). */
export type BrandCoverage = {
  /** Last day with recorded sales — the forecast cutoff. */
  latestSalesDate: string;
  /** Days with sales inside the lookback window. */
  historyDays: number;
};

/** Sales-history coverage of one location of a brand. */
export type LocationCoverage = {
  id: number;
  name: string;
  firstSalesDate: string;
  latestSalesDate: string;
  daysWithSales: number;
};

export interface ForecastGateway {
  listModels(): Promise<GatewayOutcome<ForecastModel[]>>;
  listLocations(
    brandAlias: string,
  ): Promise<GatewayOutcome<ForecastLocation[]>>;
  /** Null when the brand (or location) has no sales in the lookback window. */
  getBrandCoverage(
    brandAlias: string,
    locationId: number | null,
  ): Promise<GatewayOutcome<BrandCoverage | null>>;
  getLocationCoverage(
    brandAlias: string,
  ): Promise<GatewayOutcome<LocationCoverage[]>>;
  runForecast(
    input: ForecastGatewayRunInput,
  ): Promise<GatewayOutcome<ForecastResult>>;
}

const globalForForecastGateway = globalThis as typeof globalThis & {
  forecastGateway?: ForecastGateway | null;
};

/**
 * Installs the gateway implementation. Cached on `globalThis` so it survives
 * dev HMR of this module (same trick as the Mastra instance in ../index.ts).
 */
export function setForecastGateway(gateway: ForecastGateway | null): void {
  globalForForecastGateway.forecastGateway = gateway;
}

export function getForecastGateway(): ForecastGateway | null {
  return globalForForecastGateway.forecastGateway ?? null;
}

export function gatewayFailure<T = never>(
  code: string,
  message: string,
  options: { retryable?: boolean; details?: Record<string, unknown> } = {},
): GatewayOutcome<T> {
  return {
    ok: false,
    error: {
      code,
      message,
      retryable: options.retryable ?? false,
      ...(options.details ? { details: options.details } : {}),
    },
  };
}
