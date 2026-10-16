import { createSign } from "node:crypto";
import type { ServiceAccountCredentials } from "./google-analytics";

/**
 * Minimal GA4 Data API (v1beta) client over REST.
 *
 * Authentication is the service-account OAuth flow: sign a JWT assertion with
 * the key's private key (RS256) and exchange it at the token endpoint for a
 * short-lived bearer token. Done with `node:crypto` so the app takes no Google
 * SDK dependency. Tokens are cached per service account until shortly before
 * they expire.
 *
 * `fetchImpl` is injectable for tests only.
 */

export const GA4_DATA_API_BASE_URL =
  "https://analyticsdata.googleapis.com/v1beta";
export const GA4_DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
export const GA4_READONLY_SCOPE =
  "https://www.googleapis.com/auth/analytics.readonly";

/** batchRunReports accepts at most five requests per call. */
export const GA4_BATCH_LIMIT = 5;

const TOKEN_LIFETIME_SECONDS = 3600;
/** Refresh this long before Google's expiry to absorb clock skew / latency. */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

export class GoogleAnalyticsApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GoogleAnalyticsApiError";
  }
}

// --- Report types (subset of the REST surface we use) -----------------------------------

export type Ga4DateRange = { startDate: string; endDate: string };

export type Ga4OrderBy =
  | { metric: { metricName: string }; desc?: boolean }
  | { dimension: { dimensionName: string }; desc?: boolean };

export type Ga4NumericValue = { int64Value?: string; doubleValue?: number };

/** Single-field filter (the only shape the dashboard needs). */
export type Ga4FilterExpression = {
  filter: {
    fieldName: string;
    numericFilter?: {
      operation:
        | "EQUAL"
        | "LESS_THAN"
        | "LESS_THAN_OR_EQUAL"
        | "GREATER_THAN"
        | "GREATER_THAN_OR_EQUAL";
      value: Ga4NumericValue;
    };
    stringFilter?: {
      matchType?: "EXACT" | "BEGINS_WITH" | "ENDS_WITH" | "CONTAINS";
      value: string;
      caseSensitive?: boolean;
    };
  };
};

export type Ga4ReportRequest = {
  dimensions?: { name: string }[];
  metrics: { name: string }[];
  dateRanges: Ga4DateRange[];
  dimensionFilter?: Ga4FilterExpression;
  metricFilter?: Ga4FilterExpression;
  orderBys?: Ga4OrderBy[];
  limit?: number;
  metricAggregations?: "TOTAL"[];
  keepEmptyRows?: boolean;
};

export type Ga4MinuteRange = {
  name?: string;
  /** Inclusive; 0 = the current minute. Realtime covers at most 29 (30 min). */
  startMinutesAgo?: number;
  endMinutesAgo?: number;
};

/** `runRealtimeReport` body: no dateRanges, optional minuteRanges. */
export type Ga4RealtimeRequest = {
  dimensions?: { name: string }[];
  metrics: { name: string }[];
  minuteRanges?: Ga4MinuteRange[];
  orderBys?: Ga4OrderBy[];
  limit?: number;
};

export type Ga4Row = {
  dimensionValues?: { value?: string }[];
  metricValues?: { value?: string }[];
};

export type Ga4ReportResponse = {
  dimensionHeaders?: { name: string }[];
  metricHeaders?: { name: string; type?: string }[];
  rows?: Ga4Row[];
  totals?: Ga4Row[];
  rowCount?: number;
};

// --- Token handling ---------------------------------------------------------------------

type TokenCacheEntry = { accessToken: string; expiresAt: number };

const globalForTokens = globalThis as typeof globalThis & {
  googleAnalyticsTokenCache?: Map<string, TokenCacheEntry>;
};

function tokenCache(): Map<string, TokenCacheEntry> {
  globalForTokens.googleAnalyticsTokenCache ??= new Map();

  return globalForTokens.googleAnalyticsTokenCache;
}

/** Test hook: forget every cached access token. */
export function clearGoogleAnalyticsTokenCache(): void {
  tokenCache().clear();
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function tokenCacheKey(credentials: ServiceAccountCredentials): string {
  return `${credentials.client_email}:${credentials.private_key_id ?? ""}`;
}

/**
 * Builds the signed JWT assertion for the service-account grant. Exported so
 * tests can decode the claims without talking to Google.
 */
export function buildJwtAssertion(
  credentials: ServiceAccountCredentials,
  nowMs: number = Date.now(),
): string {
  const issuedAt = Math.floor(nowMs / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: credentials.client_email,
      scope: GA4_READONLY_SCOPE,
      aud: credentials.token_uri ?? GA4_DEFAULT_TOKEN_URI,
      iat: issuedAt,
      exp: issuedAt + TOKEN_LIFETIME_SECONDS,
    }),
  );
  const signingInput = `${header}.${claims}`;

  let signature: Buffer;
  try {
    signature = createSign("RSA-SHA256")
      .update(signingInput)
      .sign(credentials.private_key);
  } catch (err) {
    throw new GoogleAnalyticsApiError(
      400,
      "invalid_private_key",
      `The service-account private key could not be used for signing: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  return `${signingInput}.${base64url(signature)}`;
}

async function readErrorMessage(response: Response): Promise<{
  code: string;
  message: string;
}> {
  const fallback = {
    code: `http_${response.status}`,
    message: `${response.status} ${response.statusText}`.trim(),
  };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return fallback;
  }

  if (!body || typeof body !== "object") {
    return fallback;
  }

  const record = body as {
    error?: unknown;
    error_description?: unknown;
  };

  // OAuth token endpoint: { error: "invalid_grant", error_description: "..." }
  if (typeof record.error === "string") {
    return {
      code: record.error,
      message:
        typeof record.error_description === "string"
          ? record.error_description
          : record.error,
    };
  }

  // Data API: { error: { code: 403, message: "...", status: "PERMISSION_DENIED" } }
  if (record.error && typeof record.error === "object") {
    const apiError = record.error as { message?: unknown; status?: unknown };

    return {
      code:
        typeof apiError.status === "string" ? apiError.status : fallback.code,
      message:
        typeof apiError.message === "string"
          ? apiError.message
          : fallback.message,
    };
  }

  return fallback;
}

export async function getAccessToken(
  credentials: ServiceAccountCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const key = tokenCacheKey(credentials);
  const cached = tokenCache().get(key);
  const now = Date.now();

  if (cached && cached.expiresAt - TOKEN_EXPIRY_MARGIN_MS > now) {
    return cached.accessToken;
  }

  const assertion = buildJwtAssertion(credentials, now);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  let response: Response;
  try {
    response = await fetchImpl(credentials.token_uri ?? GA4_DEFAULT_TOKEN_URI, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (err) {
    throw new GoogleAnalyticsApiError(
      503,
      "token_endpoint_unreachable",
      `Could not reach Google's token endpoint: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (!response.ok) {
    const { code, message } = await readErrorMessage(response);
    throw new GoogleAnalyticsApiError(response.status, code, message);
  }

  const payload = (await response.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };

  if (typeof payload.access_token !== "string") {
    throw new GoogleAnalyticsApiError(
      502,
      "token_response_invalid",
      "Google's token endpoint returned no access token",
    );
  }

  const expiresInSeconds =
    typeof payload.expires_in === "number" && payload.expires_in > 0
      ? payload.expires_in
      : TOKEN_LIFETIME_SECONDS;

  tokenCache().set(key, {
    accessToken: payload.access_token,
    expiresAt: now + expiresInSeconds * 1000,
  });

  return payload.access_token;
}

// --- Reports ----------------------------------------------------------------------------

async function postDataApi<T>(
  path: string,
  body: unknown,
  credentials: ServiceAccountCredentials,
  fetchImpl: typeof fetch,
): Promise<T> {
  const accessToken = await getAccessToken(credentials, fetchImpl);

  let response: Response;
  try {
    response = await fetchImpl(`${GA4_DATA_API_BASE_URL}/${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new GoogleAnalyticsApiError(
      503,
      "data_api_unreachable",
      `Could not reach the Google Analytics Data API: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (!response.ok) {
    const { code, message } = await readErrorMessage(response);
    throw new GoogleAnalyticsApiError(response.status, code, message);
  }

  return (await response.json()) as T;
}

export async function runReport(
  propertyId: string,
  request: Ga4ReportRequest,
  credentials: ServiceAccountCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<Ga4ReportResponse> {
  return postDataApi<Ga4ReportResponse>(
    `properties/${propertyId}:runReport`,
    request,
    credentials,
    fetchImpl,
  );
}

/**
 * Realtime report over the last 30 minutes. Not batchable and not cached by
 * Google; callers must throttle (see `realtime.server.ts`).
 */
export async function runRealtimeReport(
  propertyId: string,
  request: Ga4RealtimeRequest,
  credentials: ServiceAccountCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<Ga4ReportResponse> {
  return postDataApi<Ga4ReportResponse>(
    `properties/${propertyId}:runRealtimeReport`,
    request,
    credentials,
    fetchImpl,
  );
}

/**
 * Runs up to five reports in one round-trip. Responses come back in request
 * order; a missing `reports` array is normalised to `[]`.
 */
export async function batchRunReports(
  propertyId: string,
  requests: Ga4ReportRequest[],
  credentials: ServiceAccountCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<Ga4ReportResponse[]> {
  if (requests.length === 0) {
    return [];
  }

  if (requests.length > GA4_BATCH_LIMIT) {
    throw new GoogleAnalyticsApiError(
      400,
      "batch_too_large",
      `batchRunReports accepts at most ${GA4_BATCH_LIMIT} requests`,
    );
  }

  const payload = await postDataApi<{ reports?: Ga4ReportResponse[] }>(
    `properties/${propertyId}:batchRunReports`,
    { requests },
    credentials,
    fetchImpl,
  );

  return payload.reports ?? [];
}

/**
 * Proves both that the key is valid and that the service account can read the
 * property: a one-metric, one-day report. Throws `GoogleAnalyticsApiError` on
 * any failure.
 */
export async function verifyPropertyAccess(
  propertyId: string,
  credentials: ServiceAccountCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await runReport(
    propertyId,
    {
      metrics: [{ name: "activeUsers" }],
      dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
      limit: 1,
    },
    credentials,
    fetchImpl,
  );
}

/**
 * User-facing explanation for a failed Google call. Keeps Google's raw message
 * (useful to admins) but leads with what to do about it.
 */
export function describeGoogleAnalyticsError(err: unknown): string {
  if (err instanceof GoogleAnalyticsApiError) {
    if (err.code === "invalid_grant" || err.code === "invalid_private_key") {
      return `Google rejected the service-account key (${err.message}). Re-upload the JSON key for this property.`;
    }

    switch (err.status) {
      case 401:
      case 403:
        return `Google denied access to this property (${err.message}). Add the service account as a Viewer on the GA4 property.`;
      case 404:
        return `Google Analytics property not found (${err.message}). Check the property id.`;
      case 429:
        return "Google Analytics quota exhausted for this property. Try again later.";
      case 502:
      case 503:
        return "Google Analytics is unreachable right now. Try again in a moment.";
      default:
        return `Google Analytics request failed (${err.message}).`;
    }
  }

  return err instanceof Error ? err.message : String(err);
}
