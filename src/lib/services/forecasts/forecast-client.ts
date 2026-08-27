import type { ZodType } from "zod";
import {
  forecastErrorResponseSchema,
  forecastHistoryResponseSchema,
  forecastModelsResponseSchema,
  forecastResultSchema,
  retryableForecastErrorCodes,
  type ForecastHistoryResponse,
  type ForecastHorizonDays,
  type ForecastModel,
  type ForecastResult,
} from "./forecast-types";

/**
 * Browser client for our own `/api/forecasts/*` routes. Success and error
 * envelopes are Zod-validated so components never see a half-typed payload.
 */

export const FORECAST_MODELS_ENDPOINT = "/api/forecasts/models";
export const FORECAST_HISTORY_ENDPOINT = "/api/forecasts/history";
export const FORECAST_RUN_ENDPOINT = "/api/forecasts/run";

export type ForecastRequestOptions = {
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
};

export class ForecastClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(input: {
    code: string;
    message: string;
    status: number;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "ForecastClientError";
    this.code = input.code;
    this.status = input.status;
    this.retryable =
      input.retryable ?? retryableForecastErrorCodes.has(input.code);
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
    case 403:
      return "FORBIDDEN";
    case 404:
      return "UNKNOWN_MODEL";
    case 422:
      return "INSUFFICIENT_HISTORY";
    case 502:
      return "ENGINE_REJECTED";
    case 503:
      return "ENGINE_UNAVAILABLE";
    case 504:
      return "ENGINE_TIMEOUT";
    default:
      return "INTERNAL";
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function parseResponse<T>(
  response: Response,
  schema: ZodType<T>,
): Promise<T> {
  const body = await readJson(response);

  if (!response.ok) {
    const envelope = forecastErrorResponseSchema.safeParse(body);
    if (envelope.success) {
      throw new ForecastClientError({
        code: envelope.data.error.code,
        message: envelope.data.error.message,
        status: response.status,
      });
    }
    const code = codeForStatus(response.status);
    throw new ForecastClientError({
      code,
      message:
        typeof body === "object" && body !== null && "message" in body
          ? String((body as { message: unknown }).message)
          : `Request failed (${response.status}).`,
      status: response.status,
      retryable:
        retryableForecastErrorCodes.has(code) || response.status >= 500,
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ForecastClientError({
      code: "INVALID_RESPONSE",
      message: "The forecast service returned an unexpected response.",
      status: response.status,
      retryable: false,
    });
  }
  return parsed.data;
}

export async function fetchForecastModels(
  options: ForecastRequestOptions = {},
): Promise<ForecastModel[]> {
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(FORECAST_MODELS_ENDPOINT, {
    signal: options.signal,
  });
  const data = await parseResponse(response, forecastModelsResponseSchema);
  return data.models;
}

export async function fetchForecastHistory(
  params: { brand: string; days?: number },
  options: ForecastRequestOptions = {},
): Promise<ForecastHistoryResponse> {
  const fetchFn = options.fetchFn ?? fetch;
  const search = new URLSearchParams({ brand: params.brand });
  if (params.days !== undefined) {
    search.set("days", String(params.days));
  }
  const response = await fetchFn(
    `${FORECAST_HISTORY_ENDPOINT}?${search.toString()}`,
    {
      signal: options.signal,
    },
  );
  return parseResponse(response, forecastHistoryResponseSchema);
}

export async function fetchForecast(
  params: {
    brandAlias: string;
    modelId: string;
    horizonDays: ForecastHorizonDays;
  },
  options: ForecastRequestOptions = {},
): Promise<ForecastResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(FORECAST_RUN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
    signal: options.signal,
  });
  return parseResponse(response, forecastResultSchema);
}
