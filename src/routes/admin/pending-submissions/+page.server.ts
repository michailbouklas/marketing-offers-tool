import { requirePermission } from "$lib/server/auth-guards";
import { getPendingGapSubmissionQueue } from "$lib/services/offers-data-quality.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  // The /admin hooks gate already enforces admin; this additionally requires
  // the approval capability, so an admin without `approver` is redirected.
  await requirePermission(event, { submission: ["approve"] });

  return {
    submissions: await getPendingGapSubmissionQueue(),
  };
};
