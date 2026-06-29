import { error, json } from "@sveltejs/kit";
import { brandEntityTypes } from "$lib/services/brand-entities";
import {
  searchCompetitionRestaurantCandidates,
  searchGoogleBusinessCandidates,
} from "$lib/services/brand-entities.server";
import { requireApiPermission } from "$lib/server/auth-guards";
import type { RequestHandler } from "./$types";

/**
 * GET /api/admin/brand-entities/search?entityType=&q= — fuzzy-search candidate
 * entities (competition restaurants or Google businesses) to assign to a
 * brand. Each result is annotated with its current brand assignment.
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

  const items =
    entityType === "competitionRestaurant"
      ? await searchCompetitionRestaurantCandidates(query)
      : await searchGoogleBusinessCandidates(query);

  return json({ items });
};
