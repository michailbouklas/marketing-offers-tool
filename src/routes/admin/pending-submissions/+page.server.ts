import { requirePermission } from "$lib/server/auth-guards";
import { getPendingGapSubmissionQueue } from "$lib/services/offers-data-quality.server";
import { getLatestSnapshotRefresh } from "$lib/services/offers-data-quality-snapshot.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  // The /admin hooks gate already enforces admin; this additionally requires
  // the approval capability, so an admin without `approver` is redirected.
  await requirePermission(event, { submission: ["approve"] });

  const [submissions, lastSnapshotRefresh] = await Promise.all([
    getPendingGapSubmissionQueue(),
    getLatestSnapshotRefresh(),
  ]);

  return {
    submissions,
    lastSnapshotRefresh,
  };
};
