import { error } from "@sveltejs/kit";
import { requireAdminUser } from "$lib/server/auth-guards";
import { getSessionDetail } from "$lib/services/aggregator-kpis/sessions.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  // Mirrors the sessions list route: admin + superUser only, tighter than the
  // section's `aggregatorKpis: ["view"]` permission.
  await requireAdminUser(event);

  const sessionId = event.params.sessionId?.trim();

  if (!sessionId) {
    throw error(404, "Session id is required");
  }

  const detail = await getSessionDetail(sessionId);

  if (!detail) {
    throw error(404, "No scrape session found for this id");
  }

  return { detail };
};
