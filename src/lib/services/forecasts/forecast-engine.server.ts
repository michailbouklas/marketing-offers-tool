import { z } from "zod";
import { getForecastEnv, type ForecastEnv } from "$lib/server/env";
import {
  forecastErrorResponseSchema,
  forecastModelSchema,
  forecastResultSchema,
  retryableForecastErrorCodes,
  type ForecastErrorCode,
  type ForecastModel,
  type ForecastResult,
} from "./forecast-types";

/**
 * Client for the Python forecast engine (`forecast-service/`). The engine is a
 * stateless JSON-in/JSON-out service: this module POSTs a daily series and
 * Zod-validates the camelCase result with the shared contract in
 * `forecast-types.ts`.
 *
 * Transport is a seam: HTTP today (`createHttpTransport`), an `execFile`
 * adapter over `python -m forecast_service --stdin` later. Tests inject a stub
 * with `__setForecastEngineTransportForTesting`.
 *
 * Logging: only `{ modelId, points, ms }` — never the series itself.
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ForecastError extends Error {
  readonly code: ForecastErrorCode;
  /** Whether a retry (same input) is likely to succeed. */
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ForecastErrorCode,
    message: string,
    options: {
      retryable?: boolean;
      details?: Record<string, unknown>;
      cause?: unknown;
    } = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "ForecastError";
    this.code = code;
    this.retryable = options.retryable ?? retryableForecastErrorCodes.has(code);
    this.details = options.details;
  }
}

export function isForecastError(value: unknown): value is ForecastError {
  return value instanceof ForecastError;
}

// ---------------------------------------------------------------------------
// Engine request shape (camelCase, mirrors schemas.py ForecastRequest)
// ---------------------------------------------------------------------------

export type EngineSeriesPoint = { ds: string; y: number; orders: number };

export type EngineForecastRequest = {
  modelId: string;
  horizonDays: number;
  /** ISO country code for holiday calendars (CY / GR). */
  country: string;
  backtestFolds: number;
  /** Free-text label echoed in engine logs (the brand alias). */
  seriesLabel: string;
  /** Sparse daily series; the engine reindexes and zero-fills. */
  series: EngineSeriesPoint[];
};

// ---------------------------------------------------------------------------
// Transport seam
// ---------------------------------------------------------------------------

/**
 * A transport resolves to the engine's parsed JSON body on success and throws
 * a `ForecastError` for every failure (HTTP status, network, timeout), so the
 * callers below only deal with contract validation.
 */
export interface ForecastEngineTransport {
  listModels(signal: AbortSignal): Promise<unknown>;
  forecast(body: EngineForecastRequest, signal: AbortSignal): Promise<unknown>;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Maps a fetch rejection (network failure / abort) to a `ForecastError`. */
export function toTransportError(err: unknown): ForecastError {
  if (isForecastError(err)) {
    return err;
  }

  const name = (err as { name?: string } | null)?.name;
  if (name === "TimeoutError" || name === "AbortError") {
    return new ForecastError(
      "ENGINE_TIMEOUT",
      "The forecast service took too long to respond.",
      { retryable: true, cause: err },
    );
  }

  return new ForecastError(
    "ENGINE_UNAVAILABLE",
    "The forecast service is unavailable.",
    { retryable: true, cause: err },
  );
}

/**
 * Maps a non-2xx engine response to a `ForecastError`:
 * 422 `INSUFFICIENT_HISTORY` → passthrough · 404 → `UNKNOWN_MODEL` ·
 * 504 / engine `TIMEOUT` → `ENGINE_TIMEOUT` · other 5xx → `ENGINE_UNAVAILABLE`
 * · other 4xx → `ENGINE_REJECTED` carrying the engine's message (429 marked
 * retryable).
 */
export function mapEngineHttpError(
  status: number,
  rawBody: unknown,
): ForecastError {
  const envelope = forecastErrorResponseSchema.safeParse(rawBody);
  const engineCode = envelope.success ? envelope.data.error.code : undefined;
  const engineMessage = envelope.success
    ? envelope.data.error.message
    : undefined;
  const details = envelope.success ? envelope.data.error.details : undefined;

  if (status === 404) {
    return new ForecastError(
      "UNKNOWN_MODEL",
      engineMessage ?? "The forecast engine does not know this model.",
      { details },
    );
  }

  if (status === 422 && engineCode === "INSUFFICIENT_HISTORY") {
    return new ForecastError(
      "INSUFFICIENT_HISTORY",
      engineMessage ?? "There is not enough sales history for this model.",
      { details },
    );
  }

  if (status === 504 || engineCode === "TIMEOUT") {
    return new ForecastError(
      "ENGINE_TIMEOUT",
      engineMessage ?? "The forecast service took too long to respond.",
      { retryable: true, details },
    );
  }

  if (status >= 500) {
    return new ForecastError(
      "ENGINE_UNAVAILABLE",
      "The forecast service is unavailable.",
      { retryable: true, details: { status, engineCode, engineMessage } },
    );
  }

  return new ForecastError(
    "ENGINE_REJECTED",
    engineMessage ?? `The forecast service rejected the request (${status}).`,
    {
      retryable: status === 429,
      details: { status, ...(engineCode ? { engineCode } : {}), ...details },
    },
  );
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function createHttpTransport(options: {
  baseUrl: string;
  token?: string;
  fetchFn?: FetchLike;
}): ForecastEngineTransport {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn: FetchLike =
    options.fetchFn ?? ((input, init) => fetch(input, init));

  async function request(
    path: string,
    init: { method: "GET" | "POST"; body?: string },
    signal: AbortSignal,
  ): Promise<unknown> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (init.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if (options.token) {
      headers.authorization = `Bearer ${options.token}`;
    }

    let response: Response;
    try {
      response = await fetchFn(`${baseUrl}${path}`, {
        method: init.method,
        headers,
        body: init.body,
        signal,
      });
    } catch (err) {
      throw toTransportError(err);
    }

    const body = await readJsonBody(response);

    if (!response.ok) {
      throw mapEngineHttpError(response.status, body);
    }

    if (body === undefined) {
      throw new ForecastError(
        "INVALID_RESPONSE",
        "The forecast service returned a non-JSON response.",
      );
    }

    return body;
  }

  return {
    listModels: (signal) => request("/models", { method: "GET" }, signal),
    forecast: (body, signal) =>
      request(
        "/forecast",
        { method: "POST", body: JSON.stringify(body) },
        signal,
      ),
  };
}

let transportOverride: ForecastEngineTransport | null = null;
let httpTransport: { key: string; transport: ForecastEngineTransport } | null =
  null;

/** Test seam — inject a stub transport (pass null to restore HTTP). */
export function __setForecastEngineTransportForTesting(
  transport: ForecastEngineTransport | null,
): void {
  transportOverride = transport;
}

function getTransport(env: ForecastEnv): ForecastEngineTransport {
  if (transportOverride) {
    return transportOverride;
  }

  if (!env.FORECAST_SERVICE_URL) {
    throw new ForecastError(
      "NOT_CONFIGURED",
      "The forecast service is not configured (FORECAST_SERVICE_URL is unset).",
    );
  }

  const key = `${env.FORECAST_SERVICE_URL}|${env.FORECAST_SERVICE_TOKEN ?? ""}`;
  if (!httpTransport || httpTransport.key !== key) {
    httpTransport = {
      key,
      transport: createHttpTransport({
        baseUrl: env.FORECAST_SERVICE_URL,
        token: env.FORECAST_SERVICE_TOKEN,
      }),
    };
  }

  return httpTransport.transport;
}

// ---------------------------------------------------------------------------
// Model catalog (TTL cache)
// ---------------------------------------------------------------------------

/** `GET /models` is cheap; never let a hung engine stall a page load for long. */
const MODELS_TIMEOUT_MS = 10_000;

const modelsListSchema = z.array(forecastModelSchema);

let modelsCache: { at: number; models: ForecastModel[] } | null = null;
let modelsInFlight: Promise<ForecastModel[]> | null = null;

/** Test helper — drops the catalog cache. */
export function __clearForecastModelsCache(): void {
  modelsCache = null;
  modelsInFlight = null;
}

/**
 * Public model catalog from the engine, cached for `FORECAST_MODELS_TTL_MS`.
 * Concurrent callers share one in-flight request.
 */
export async function listForecastModels(
  options: { now?: number } = {},
): Promise<ForecastModel[]> {
  const now = options.now ?? Date.now();
  const env = getForecastEnv();

  if (modelsCache && now - modelsCache.at < env.FORECAST_MODELS_TTL_MS) {
    return modelsCache.models;
  }

  if (modelsInFlight) {
    return modelsInFlight;
  }

  const transport = getTransport(env);
  const timeoutMs = Math.min(env.FORECAST_TIMEOUT_MS, MODELS_TIMEOUT_MS);

  modelsInFlight = (async () => {
    const raw = await transport.listModels(AbortSignal.timeout(timeoutMs));
    const parsed = modelsListSchema.safeParse(raw);

    if (!parsed.success) {
      console.error(
        "[forecasts] engine /models response failed validation",
        parsed.error.issues.map((issue) => issue.path.join(".")),
      );
      throw new ForecastError(
        "INVALID_RESPONSE",
        "The forecast service returned an unexpected model list.",
      );
    }

    modelsCache = { at: now, models: parsed.data };
    return parsed.data;
  })().finally(() => {
    modelsInFlight = null;
  });

  return modelsInFlight;
}

// ---------------------------------------------------------------------------
// Forecast run
// ---------------------------------------------------------------------------

/**
 * Runs one model on one series. Validates the engine response against
 * `forecastResultSchema`; a contract mismatch surfaces as `INVALID_RESPONSE`.
 */
export async function runForecast(
  request: EngineForecastRequest,
): Promise<ForecastResult> {
  const env = getForecastEnv();
  const transport = getTransport(env);
  const started = Date.now();

  const raw = await transport.forecast(
    request,
    AbortSignal.timeout(env.FORECAST_TIMEOUT_MS),
  );
  const parsed = forecastResultSchema.safeParse(raw);
  const ms = Date.now() - started;

  if (!parsed.success) {
    console.error("[forecasts] engine /forecast response failed validation", {
      modelId: request.modelId,
      points: request.series.length,
      ms,
      issues: parsed.error.issues
        .slice(0, 10)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    });
    throw new ForecastError(
      "INVALID_RESPONSE",
      "The forecast service returned an unexpected result.",
    );
  }

  console.info("[forecasts] engine run", {
    modelId: request.modelId,
    points: request.series.length,
    ms,
  });

  return parsed.data;
}
