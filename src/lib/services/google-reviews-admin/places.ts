import { z } from "zod";

/**
 * Browser-safe types and schemas for the `/admin/google-reviews/places` tool
 * ("Places manager"), which manages the `scrape_queries` table of the Google
 * Reviews scraper through its REST API (`GOOGLE_PLACES_API`, see
 * `src/lib/server/env.ts`). A "place" is one Google Maps search text the
 * scraper runs, e.g. "Coffee Island cyprus". Server calls live in
 * `./places.server.ts`.
 */

export type ScrapeQueryRow = {
  id: number;
  query: string;
  enabled: boolean;
  /** Brand id on the scraper side (its own `brands` table), not a Prisma brand. */
  brandId: number | null;
  notes: string | null;
  lastScrapedAt: string | null;
  lastRunId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Brand as exposed by the scraper API's `GET /brands`. */
export type ScrapeQueryBrand = {
  /** Id in the scraper API's `/brands` (what `ScrapeQueryRow.brandId` holds). */
  remoteId: number;
  /** App brand name when mapped (`brand.google_places_brand_id`), else the scraper title. */
  title: string;
  /** App `brand.id` when the scraper brand is mapped, else null. */
  appBrandId: number | null;
};

/** Result of propagating place brands to app-side business assignments. */
export type PlaceBrandSyncSummary = {
  places: number;
  unmappedPlaces: number;
  discovered: number;
  assigned: number;
  alreadyAssigned: number;
  skippedConflicts: number;
};

export type ScrapeQueriesPage = {
  items: ScrapeQueryRow[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export const scrapeQueryStatusFilters = ["all", "enabled", "disabled"] as const;

export type ScrapeQueryStatusFilter = (typeof scrapeQueryStatusFilters)[number];

/** The scraper API only forbids this delimiter; the max lengths are UI guards. */
export const SCRAPE_QUERY_FORBIDDEN_TOKEN = "#!#";
export const SCRAPE_QUERY_MAX_LENGTH = 500;
export const SCRAPE_QUERY_NOTES_MAX_LENGTH = 2000;

/**
 * Create/edit dialog form. `id === 0` means "create"; any positive id is an
 * update of that row.
 */
export const scrapeQueryFormSchema = z.object({
  id: z.number().int().nonnegative(),
  query: z
    .string()
    .trim()
    .min(1, "Search text is required.")
    .max(
      SCRAPE_QUERY_MAX_LENGTH,
      `Search text must be at most ${SCRAPE_QUERY_MAX_LENGTH} characters.`,
    )
    .refine(
      (value) => !value.includes(SCRAPE_QUERY_FORBIDDEN_TOKEN),
      `Search text must not contain "${SCRAPE_QUERY_FORBIDDEN_TOKEN}".`,
    ),
  enabled: z.boolean(),
  brandId: z.number().int().positive().nullable(),
  notes: z
    .string()
    .trim()
    .max(
      SCRAPE_QUERY_NOTES_MAX_LENGTH,
      `Notes must be at most ${SCRAPE_QUERY_NOTES_MAX_LENGTH} characters.`,
    ),
});

export type ScrapeQueryFormData = z.infer<typeof scrapeQueryFormSchema>;

export function getDefaultScrapeQueryFormData(): ScrapeQueryFormData {
  return {
    id: 0,
    query: "",
    enabled: true,
    brandId: null,
    notes: "",
  };
}

export const deleteScrapeQuerySchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type ScrapeQueryActionMessage = {
  type: "success" | "error";
  text: string;
};

/**
 * Any failure talking to the scraper API. `status` mirrors the upstream HTTP
 * status (400 validation / duplicate query / unknown brand, 404 not found)
 * or a synthetic one: 503 when the API is unreachable or `GOOGLE_PLACES_API`
 * is unset, 502 when it answered with something that is not its JSON envelope.
 */
export class GooglePlacesApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GooglePlacesApiError";
  }
}
