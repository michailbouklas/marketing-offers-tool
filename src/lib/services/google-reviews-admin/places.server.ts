import { getGooglePlacesApiUrl } from "$lib/server/env";
import {
  GooglePlacesApiError,
  type ScrapeQueriesPage,
  type ScrapeQueryBrand,
  type ScrapeQueryRow,
  type ScrapeQueryStatusFilter,
} from "./places";

/**
 * Typed client for the Google Reviews scraper API's `/scrape-queries` and
 * `/brands` endpoints (`GOOGLE_PLACES_API`). The API has no auth and answers
 * every call with `{ success, data, pagination? }` or
 * `{ success: false, error: { code, message } }`.
 */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Row shape as the scraper API returns it (snake_case). */
type ApiScrapeQuery = {
  id: number;
  query: string;
  enabled: boolean;
  brand_id?: number | null;
  notes?: string | null;
  last_scraped_at?: string | null;
  last_run_id?: string | null;
  created_at: string;
  updated_at: string;
};

type ApiBrand = {
  id: number;
  title: string;
};

type ApiPagination = {
  limit: number;
  offset: number;
  total: number;
};

/**
 * Success envelope plus both error shapes the API emits: the documented
 * `{ success: false, error: { code, message } }` and the one the live server
 * actually sends, `{ error: true, message, errorCode, suggestedAction }`.
 */
type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  pagination?: ApiPagination;
  error?: boolean | { code?: string; message?: string };
  message?: string;
  errorCode?: string;
};

export function readApiError(envelope: ApiEnvelope<unknown> | undefined): {
  code?: string;
  message?: string;
} {
  if (!envelope) {
    return {};
  }

  if (typeof envelope.error === "object" && envelope.error !== null) {
    return { code: envelope.error.code, message: envelope.error.message };
  }

  return { code: envelope.errorCode, message: envelope.message };
}

export type ScrapeQueryWriteInput = {
  query: string;
  enabled: boolean;
  /** `null` unlinks the brand. */
  brandId: number | null;
  /** Empty string is sent as `null`. */
  notes: string;
};

export type ListScrapeQueriesOptions = {
  page: number;
  pageSize: number;
  search: string | null;
  status: ScrapeQueryStatusFilter;
};

export type GooglePlacesClient = {
  listScrapeQueriesPage(
    options: ListScrapeQueriesOptions,
  ): Promise<ScrapeQueriesPage>;
  createScrapeQuery(input: ScrapeQueryWriteInput): Promise<ScrapeQueryRow>;
  updateScrapeQuery(
    id: number,
    input: ScrapeQueryWriteInput,
  ): Promise<ScrapeQueryRow>;
  deleteScrapeQuery(id: number): Promise<void>;
  getScrapeQuery(id: number): Promise<ScrapeQueryRow>;
  listBrands(): Promise<ScrapeQueryBrand[]>;
};

const DEFAULT_TIMEOUT_MS = 10_000;
/** The API caps `limit` at 100. */
const MAX_PAGE_SIZE = 100;

function toRow(raw: ApiScrapeQuery): ScrapeQueryRow {
  return {
    id: raw.id,
    query: raw.query,
    enabled: raw.enabled,
    brandId: raw.brand_id ?? null,
    notes: raw.notes ?? null,
    lastScrapedAt: raw.last_scraped_at ?? null,
    lastRunId: raw.last_run_id ?? null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

function toWriteBody(input: ScrapeQueryWriteInput) {
  const notes = input.notes.trim();

  return {
    query: input.query.trim(),
    enabled: input.enabled,
    brand_id: input.brandId,
    notes: notes.length > 0 ? notes : null,
  };
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

function isEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return typeof value === "object" && value !== null;
}

export function createGooglePlacesClient(options: {
  baseUrl: string;
  fetchFn?: FetchLike;
  timeoutMs?: number;
}): GooglePlacesClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchFn: FetchLike =
    options.fetchFn ?? ((input, init) => fetch(input, init));

  async function request<T>(
    path: string,
    init: {
      method: "GET" | "POST" | "PUT" | "DELETE";
      body?: unknown;
      searchParams?: Record<string, string | number | boolean | undefined>;
    },
  ): Promise<ApiEnvelope<T>> {
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(init.searchParams ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = { accept: "application/json" };
    if (init.body !== undefined) {
      headers["content-type"] = "application/json";
    }

    let response: Response;
    try {
      response = await fetchFn(url.toString(), {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new GooglePlacesApiError(
        503,
        "UNREACHABLE",
        `Could not reach the Google Places API (${detail}).`,
      );
    }

    const body = await readJsonBody(response);
    const envelope = isEnvelope(body) ? (body as ApiEnvelope<T>) : undefined;

    if (!response.ok) {
      const apiError = readApiError(envelope);
      throw new GooglePlacesApiError(
        response.status,
        apiError.code ?? `HTTP_${response.status}`,
        apiError.message ??
          `The Google Places API answered with HTTP ${response.status}.`,
      );
    }

    if (!envelope || envelope.success !== true) {
      throw new GooglePlacesApiError(
        502,
        "INVALID_RESPONSE",
        "The Google Places API returned an unexpected response.",
      );
    }

    return envelope;
  }

  return {
    async listScrapeQueriesPage(listOptions) {
      const pageSize = Math.min(
        Math.max(listOptions.pageSize, 1),
        MAX_PAGE_SIZE,
      );
      const page = Math.max(listOptions.page, 1);
      const search = listOptions.search?.trim();

      const envelope = await request<ApiScrapeQuery[]>("/scrape-queries", {
        method: "GET",
        searchParams: {
          limit: pageSize,
          offset: (page - 1) * pageSize,
          search: search ? search : undefined,
          enabled:
            listOptions.status === "all"
              ? undefined
              : listOptions.status === "enabled",
          order_by: "id",
          order_direction: "ASC",
        },
      });

      const items = (envelope.data ?? []).map(toRow);
      const totalItems = envelope.pagination?.total ?? items.length;

      return {
        items,
        page,
        pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      };
    },

    async createScrapeQuery(input) {
      const envelope = await request<ApiScrapeQuery>("/scrape-queries", {
        method: "POST",
        body: toWriteBody(input),
      });

      if (!envelope.data) {
        throw new GooglePlacesApiError(
          502,
          "INVALID_RESPONSE",
          "The Google Places API did not return the created place.",
        );
      }

      return toRow(envelope.data);
    },

    async updateScrapeQuery(id, input) {
      const envelope = await request<ApiScrapeQuery>(
        `/scrape-queries/${encodeURIComponent(id)}`,
        { method: "PUT", body: toWriteBody(input) },
      );

      if (!envelope.data) {
        throw new GooglePlacesApiError(
          502,
          "INVALID_RESPONSE",
          "The Google Places API did not return the updated place.",
        );
      }

      return toRow(envelope.data);
    },

    async deleteScrapeQuery(id) {
      await request<never>(`/scrape-queries/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },

    async getScrapeQuery(id) {
      const envelope = await request<ApiScrapeQuery>(
        `/scrape-queries/${encodeURIComponent(id)}`,
        { method: "GET" },
      );

      if (!envelope.data) {
        throw new GooglePlacesApiError(
          502,
          "INVALID_RESPONSE",
          "The Google Places API did not return the place.",
        );
      }

      return toRow(envelope.data);
    },

    async listBrands() {
      const envelope = await request<ApiBrand[]>("/brands", {
        method: "GET",
        searchParams: { limit: MAX_PAGE_SIZE, offset: 0 },
      });

      return (envelope.data ?? [])
        .map((brand) => ({
          remoteId: brand.id,
          title: brand.title,
          appBrandId: null,
        }))
        .sort((a, b) => a.title.localeCompare(b.title, "en"));
    },
  };
}

/**
 * Client bound to `GOOGLE_PLACES_API`. Throws a 503 `GooglePlacesApiError`
 * when the variable is unset so callers can render a configuration hint
 * instead of a generic failure.
 */
export function getGooglePlacesClient(): GooglePlacesClient {
  const baseUrl = getGooglePlacesApiUrl();

  if (!baseUrl) {
    throw new GooglePlacesApiError(
      503,
      "NOT_CONFIGURED",
      "GOOGLE_PLACES_API is not set. Point it at the Google Reviews scraper API root.",
    );
  }

  return createGooglePlacesClient({ baseUrl });
}

// These are `async` so a missing `GOOGLE_PLACES_API` rejects rather than
// throwing synchronously, which keeps `.catch()` chains in callers honest.

export async function listScrapeQueriesPage(options: ListScrapeQueriesOptions) {
  return getGooglePlacesClient().listScrapeQueriesPage(options);
}

export async function createScrapeQuery(input: ScrapeQueryWriteInput) {
  return getGooglePlacesClient().createScrapeQuery(input);
}

export async function updateScrapeQuery(
  id: number,
  input: ScrapeQueryWriteInput,
) {
  return getGooglePlacesClient().updateScrapeQuery(id, input);
}

export async function deleteScrapeQuery(id: number) {
  return getGooglePlacesClient().deleteScrapeQuery(id);
}

export async function listScrapeQueryBrands() {
  return getGooglePlacesClient().listBrands();
}

export async function getScrapeQuery(id: number) {
  return getGooglePlacesClient().getScrapeQuery(id);
}
