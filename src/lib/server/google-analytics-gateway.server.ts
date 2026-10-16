import {
  getGoogleAnalyticsGateway,
  setGoogleAnalyticsGateway,
  type GoogleAnalyticsGateway,
  type GoogleAnalyticsGatewayOutcome,
} from "$lib/server/mastra/tools/google-analytics-gateway";
import { getGoogleAnalyticsDashboard } from "$lib/services/google-analytics/dashboard.server";
import {
  describeGoogleAnalyticsError,
  getMetadata,
  GoogleAnalyticsApiError,
  runRealtimeReport,
  runReport,
  type Ga4MetadataResponse,
} from "$lib/services/google-analytics/ga4-client.server";
import { getDecryptedCredentials } from "$lib/services/google-analytics/properties.server";

/**
 * SvelteKit-side implementation of the Google Analytics tools' gateway
 * (`src/lib/server/mastra/tools/google-analytics-gateway.ts`). Decrypts the
 * property's service-account key, calls the GA4 Data API client and flattens
 * `GoogleAnalyticsApiError`s into plain outcomes the tools can hand to the
 * model.
 *
 * Lives outside `src/lib/server/mastra/` on purpose: the services it wraps
 * import Prisma and `$lib/server/env` (`$env/dynamic/private`), which that
 * directory must avoid so `mastra dev` can bundle it — the same reason
 * `forecast-gateway.server.ts` sits here. Installed once from
 * `src/hooks.server.ts`; nothing here touches env at import time.
 */

/** Google's `getMetadata` answer rarely changes; one call per property per 10 min. */
const METADATA_TTL_MS = 10 * 60_000;

type MetadataCacheEntry = { cachedAt: number; value: Ga4MetadataResponse };

const globalForMetadata = globalThis as typeof globalThis & {
  googleAnalyticsMetadataCache?: Map<string, MetadataCacheEntry>;
};

function metadataCache(): Map<string, MetadataCacheEntry> {
  globalForMetadata.googleAnalyticsMetadataCache ??= new Map();
  return globalForMetadata.googleAnalyticsMetadataCache;
}

/** Test hook. */
export function clearGoogleAnalyticsMetadataCache(): void {
  metadataCache().clear();
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

async function attempt<T>(
  task: () => Promise<T>,
): Promise<GoogleAnalyticsGatewayOutcome<T>> {
  try {
    return { ok: true, value: await task() };
  } catch (cause) {
    if (cause instanceof GoogleAnalyticsApiError) {
      // Google's own answer: logged so quota / permission problems a user
      // reports from the chat can be matched to server time.
      console.warn(
        `[google-analytics-gateway] ${cause.code} (${cause.status}): ${cause.message}`,
      );
      return {
        ok: false,
        error: {
          code: cause.code,
          // A bad request needs Google's exact wording so the model can fix
          // the field; everything else reads better as the admin-facing text.
          message:
            cause.code === "INVALID_ARGUMENT"
              ? cause.message
              : describeGoogleAnalyticsError(cause),
          status: cause.status,
          retryable: RETRYABLE_STATUSES.has(cause.status),
        },
      };
    }

    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`[google-analytics-gateway] ${message}`);
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message:
          "Google Analytics could not be queried for this property (the stored key may be missing or unreadable). Ask an admin to check the property under Admin → Brands.",
        status: 0,
        retryable: false,
      },
    };
  }
}

export function createGoogleAnalyticsGateway(): GoogleAnalyticsGateway {
  return {
    runReport: (propertyRowId, request) =>
      attempt(async () => {
        const { propertyId, credentials } =
          await getDecryptedCredentials(propertyRowId);
        return runReport(propertyId, request, credentials);
      }),

    runRealtimeReport: (propertyRowId, request) =>
      attempt(async () => {
        const { propertyId, credentials } =
          await getDecryptedCredentials(propertyRowId);
        return runRealtimeReport(propertyId, request, credentials);
      }),

    getMetadata: (propertyRowId) =>
      attempt(async () => {
        const cached = metadataCache().get(propertyRowId);
        const now = Date.now();
        if (cached && now - cached.cachedAt < METADATA_TTL_MS) {
          return cached.value;
        }

        const { propertyId, credentials } =
          await getDecryptedCredentials(propertyRowId);
        const value = await getMetadata(propertyId, credentials);
        metadataCache().set(propertyRowId, { cachedAt: now, value });
        return value;
      }),

    getDashboard: (propertyRowId, range) =>
      attempt(() => getGoogleAnalyticsDashboard({ id: propertyRowId }, range)),
  };
}

/** Idempotent: keeps an already-installed gateway (dev HMR, tests). */
export function installGoogleAnalyticsGateway(): void {
  if (!getGoogleAnalyticsGateway()) {
    setGoogleAnalyticsGateway(createGoogleAnalyticsGateway());
  }
}
