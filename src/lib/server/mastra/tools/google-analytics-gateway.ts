import type {
  Ga4MetadataResponse,
  Ga4RealtimeRequest,
  Ga4ReportRequest,
  Ga4ReportResponse,
} from "../../../services/google-analytics/ga4-client.server";
import type {
  GoogleAnalyticsDashboard,
  GoogleAnalyticsRange,
} from "../../../services/google-analytics/google-analytics";

/**
 * Seam between the Google Analytics tools (this directory) and the GA4
 * services in `src/lib/services/google-analytics/*.server.ts`.
 *
 * Those services decrypt per-property service-account keys through Prisma and
 * `$lib/server/env` (SvelteKit `$env/dynamic/private`), which nothing under
 * `src/lib/server/mastra/` may import — the directory must stay bundlable by
 * the standalone `mastra dev` playground (see ../env.ts). So the tools only
 * know this interface; the SvelteKit app installs the implementation at
 * server start (`src/lib/server/google-analytics-gateway.server.ts` from
 * `src/hooks.server.ts`). In the playground no gateway is installed and the
 * tools fail closed with a clear message. Same pattern as forecast-gateway.ts.
 *
 * Imports here are type-only.
 */

/** Plain, serialisable mirror of `GoogleAnalyticsApiError` (or a crypto error). */
export type GoogleAnalyticsGatewayError = {
  /** Google's status string (INVALID_ARGUMENT, PERMISSION_DENIED, …) or an app code. */
  code: string;
  message: string;
  /** HTTP status when the failure came from Google; 0 otherwise. */
  status: number;
  /** Whether repeating the same call is likely to succeed. */
  retryable: boolean;
};

export type GoogleAnalyticsGatewayOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: GoogleAnalyticsGatewayError };

export interface GoogleAnalyticsGateway {
  /** `runReport` for the property behind a `brand_google_analytics_property` row. */
  runReport(
    propertyRowId: string,
    request: Ga4ReportRequest,
  ): Promise<GoogleAnalyticsGatewayOutcome<Ga4ReportResponse>>;
  runRealtimeReport(
    propertyRowId: string,
    request: Ga4RealtimeRequest,
  ): Promise<GoogleAnalyticsGatewayOutcome<Ga4ReportResponse>>;
  /** Dimension/metric catalogue of the property (cached by the implementation). */
  getMetadata(
    propertyRowId: string,
  ): Promise<GoogleAnalyticsGatewayOutcome<Ga4MetadataResponse>>;
  /** The overview dashboard exactly as the page shows it (shares its cache). */
  getDashboard(
    propertyRowId: string,
    range: GoogleAnalyticsRange,
  ): Promise<GoogleAnalyticsGatewayOutcome<GoogleAnalyticsDashboard>>;
}

const globalForGateway = globalThis as typeof globalThis & {
  googleAnalyticsGateway?: GoogleAnalyticsGateway | null;
};

/**
 * Installs the gateway implementation. Cached on `globalThis` so it survives
 * dev HMR of this module (same trick as the Mastra instance in ../index.ts).
 */
export function setGoogleAnalyticsGateway(
  gateway: GoogleAnalyticsGateway | null,
): void {
  globalForGateway.googleAnalyticsGateway = gateway;
}

export function getGoogleAnalyticsGateway(): GoogleAnalyticsGateway | null {
  return globalForGateway.googleAnalyticsGateway ?? null;
}
