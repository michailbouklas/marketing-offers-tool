import { error, json } from "@sveltejs/kit";
import { searchAggregatorStoreCandidates } from "$lib/services/aggregator-kpis/brand-stores.server";
import {
  brandEntityTypes,
  type BrandEntityType,
} from "$lib/services/brand-entities";
import {
  searchCompetitionRestaurantCandidates,
  searchGoogleBusinessCandidates,
} from "$lib/services/brand-entities.server";
import { requireApiPermission } from "$lib/server/auth-guards";
import type { RequestHandler } from "./$types";

const searchers: Record<
  BrandEntityType,
  (query: string) => Promise<unknown[]>
> = {
  competitionRestaurant: searchCompetitionRestaurantCandidates,
  googleReviewsBusiness: searchGoogleBusinessCandidates,
  aggregatorStore: searchAggregatorStoreCandidates,
};

/**
 * GET /api/admin/brand-entities/search?entityType=&q= — fuzzy-search candidate
 * entities (competition restaurants, Google businesses, or aggregator KPI
 * stores) to assign to a brand. Each result is annotated with its current
 * brand assignment.
 */
export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, { brand: ["manage"] });

  const entityType = event.url.searchParams.get("entityType");
  if (
    !entityType ||
    !(brandEntityTypes as readonly string[]).includes(entityType)
  ) {
    error(400, "Unknown or missing entityType");
  }

  const query = event.url.searchParams.get("q") ?? "";
  const items = await searchers[entityType as BrandEntityType](query);

  return json({ items });
};
