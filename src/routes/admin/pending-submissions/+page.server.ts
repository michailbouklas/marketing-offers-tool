import { requireAdminUser } from "$lib/server/auth-guards";
import { getPendingGapSubmissionQueue } from "$lib/services/offers-data-quality.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requireAdminUser(event);

  return {
    submissions: await getPendingGapSubmissionQueue(),
  };
};
