import { googleReviewsPrisma } from "$lib/server/google-reviews-prisma";
import { prisma } from "$lib/server/prisma";
import {
  assignEntitiesToBrand,
  getBrandRefsByEntityIds,
} from "$lib/services/brand-entities.server";
import type { ScrapeQueryBrand } from "./places";
import { listScrapeQueriesPage } from "./places.server";

/**
 * Brand options for the Places manager: the scraper's `/brands` labelled with
 * the app brand each maps to. Mapped app brands whose scraper entry is missing
 * from `remoteBrands` (e.g. the scraper list failed to load) are still offered.
 */
export async function listPlaceBrandOptions(
  remoteBrands: ScrapeQueryBrand[],
): Promise<ScrapeQueryBrand[]> {
  const appBrands = await prisma.brand.findMany({
    where: { google_places_brand_id: { not: null } },
    select: { id: true, name: true, google_places_brand_id: true },
  });

  const byRemoteId = new Map<number, ScrapeQueryBrand>(
    remoteBrands.map((brand) => [brand.remoteId, { ...brand }]),
  );

  for (const appBrand of appBrands) {
    const remoteId = appBrand.google_places_brand_id;
    if (remoteId === null) {
      continue;
    }
    byRemoteId.set(remoteId, {
      remoteId,
      title: appBrand.name.trim(),
      appBrandId: appBrand.id,
    });
  }

  return [...byRemoteId.values()].sort((a, b) =>
    a.title.localeCompare(b.title, "en"),
  );
}

/**
 * Propagates a place's brand (the scraper's `scrape_queries.brand_id`) to the
 * app-side `brand_entity` assignments of every business that place discovered
 * (`businesses.input_id = <place id>` in the scraper Postgres), so the Google
 * Reviews brand filters work without a second manual assignment on
 * `/admin/brands/[id]`.
 *
 * Rules agreed with the team (2026-10-15):
 * - A business already assigned by hand to a *different* brand is skipped and
 *   counted, unless that brand is the place's previous brand (then it moves).
 * - Unlinking a place (brand → none) or deleting it never removes assignments;
 *   `brand_entity` has no origin marker, so removal could hit manual work.
 *
 * Scraper brand ids map to app brands through `brand.google_places_brand_id`
 * (filled by `scripts/sync-google-places-brands.ts`).
 */

export type PlaceBrandSyncResult = {
  placeId: number;
  remoteBrandId: number | null;
  /** App brand the scraper brand maps to; null when unmapped or no brand. */
  brandId: number | null;
  brandName: string | null;
  /** The scraper brand has no `brand.google_places_brand_id` counterpart. */
  unmappedBrand: boolean;
  discovered: number;
  assigned: number;
  alreadyAssigned: number;
  skippedConflicts: number;
};

export type PlaceBrandSyncTotals = {
  places: number;
  unmappedPlaces: number;
  discovered: number;
  assigned: number;
  alreadyAssigned: number;
  skippedConflicts: number;
};

export type PropagatePlaceBrandInput = {
  placeId: number;
  remoteBrandId: number | null;
  /** Scraper brand the place carried before this save, if it changed. */
  previousRemoteBrandId?: number | null;
  actorUserId?: string | null;
};

async function findAppBrand(remoteBrandId: number) {
  return prisma.brand.findUnique({
    where: { google_places_brand_id: remoteBrandId },
    select: { id: true, name: true },
  });
}

export async function propagatePlaceBrand(
  input: PropagatePlaceBrandInput,
): Promise<PlaceBrandSyncResult> {
  const result: PlaceBrandSyncResult = {
    placeId: input.placeId,
    remoteBrandId: input.remoteBrandId,
    brandId: null,
    brandName: null,
    unmappedBrand: false,
    discovered: 0,
    assigned: 0,
    alreadyAssigned: 0,
    skippedConflicts: 0,
  };

  if (input.remoteBrandId === null) {
    return result;
  }

  const brand = await findAppBrand(input.remoteBrandId);
  if (!brand) {
    result.unmappedBrand = true;
    return result;
  }
  result.brandId = brand.id;
  result.brandName = brand.name;

  const businesses = await googleReviewsPrisma.businesses.findMany({
    where: { input_id: String(input.placeId) },
    select: { cid: true },
  });
  const cids = [...new Set(businesses.map((business) => business.cid))];
  result.discovered = cids.length;
  if (cids.length === 0) {
    return result;
  }

  let previousBrandId: number | null = null;
  if (
    input.previousRemoteBrandId !== undefined &&
    input.previousRemoteBrandId !== null &&
    input.previousRemoteBrandId !== input.remoteBrandId
  ) {
    previousBrandId =
      (await findAppBrand(input.previousRemoteBrandId))?.id ?? null;
  }

  const existing = await getBrandRefsByEntityIds("googleReviewsBusiness", cids);
  const toAssign: string[] = [];

  for (const cid of cids) {
    const current = existing.get(cid);
    if (!current) {
      toAssign.push(cid);
    } else if (current.brandId === brand.id) {
      result.alreadyAssigned += 1;
    } else if (
      previousBrandId !== null &&
      current.brandId === previousBrandId
    ) {
      toAssign.push(cid);
    } else {
      result.skippedConflicts += 1;
    }
  }

  if (toAssign.length > 0) {
    result.assigned = await assignEntitiesToBrand({
      brandId: brand.id,
      entityType: "googleReviewsBusiness",
      entityIds: toAssign,
      createdBy: input.actorUserId ?? null,
    });
  }

  return result;
}

/** Backfill: propagate every place that carries a brand. Pages through the API. */
export async function propagateAllPlaceBrands(
  actorUserId?: string | null,
): Promise<{ totals: PlaceBrandSyncTotals; results: PlaceBrandSyncResult[] }> {
  const results: PlaceBrandSyncResult[] = [];
  let page = 1;

  for (;;) {
    const listed = await listScrapeQueriesPage({
      page,
      pageSize: 100,
      search: null,
      status: "all",
    });

    for (const row of listed.items) {
      if (row.brandId === null) {
        continue;
      }
      results.push(
        await propagatePlaceBrand({
          placeId: row.id,
          remoteBrandId: row.brandId,
          actorUserId,
        }),
      );
    }

    if (page >= listed.totalPages || listed.items.length === 0) {
      break;
    }
    page += 1;
  }

  const totals: PlaceBrandSyncTotals = {
    places: results.length,
    unmappedPlaces: 0,
    discovered: 0,
    assigned: 0,
    alreadyAssigned: 0,
    skippedConflicts: 0,
  };
  for (const r of results) {
    totals.unmappedPlaces += r.unmappedBrand ? 1 : 0;
    totals.discovered += r.discovered;
    totals.assigned += r.assigned;
    totals.alreadyAssigned += r.alreadyAssigned;
    totals.skippedConflicts += r.skippedConflicts;
  }

  return { totals, results };
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Toast text for a single place after a save. Empty when there is nothing to say. */
export function formatPlaceBrandSyncMessage(
  result: PlaceBrandSyncResult,
): string {
  if (result.remoteBrandId === null) {
    return "";
  }
  if (result.unmappedBrand) {
    return `The scraper brand #${result.remoteBrandId} is not linked to a brand in this app yet, so no businesses were assigned. Run the brand sync script.`;
  }
  if (result.discovered === 0) {
    return `No businesses discovered by this place yet; they will be assigned to ${result.brandName} after the next scrape.`;
  }

  const details: string[] = [];
  if (result.alreadyAssigned > 0) {
    details.push(`${result.alreadyAssigned} already linked`);
  }
  if (result.skippedConflicts > 0) {
    details.push(
      `${result.skippedConflicts} skipped: assigned to another brand`,
    );
  }

  const suffix = details.length > 0 ? ` (${details.join(", ")})` : "";
  if (result.assigned === 0) {
    return `No new businesses to link to ${result.brandName}${suffix}.`;
  }

  return `Linked ${plural(result.assigned, "business", "businesses")} to ${result.brandName}${suffix}.`;
}

export function formatPlaceBrandSyncTotals(
  totals: PlaceBrandSyncTotals,
): string {
  const details: string[] = [];
  if (totals.alreadyAssigned > 0) {
    details.push(`${totals.alreadyAssigned} already linked`);
  }
  if (totals.skippedConflicts > 0) {
    details.push(
      `${totals.skippedConflicts} skipped: assigned to another brand`,
    );
  }
  if (totals.unmappedPlaces > 0) {
    details.push(
      `${plural(totals.unmappedPlaces, "place")} with an unlinked scraper brand`,
    );
  }

  return `Synced ${plural(totals.places, "place")}: linked ${plural(totals.assigned, "business", "businesses")}${details.length > 0 ? ` (${details.join(", ")})` : ""}.`;
}
