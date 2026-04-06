import { redirect } from "@sveltejs/kit";
import { requireAuthenticatedUser } from "$lib/server/auth-guards";
import { ensureGapRecordForItemCode } from "$lib/services/offers-data-quality.server";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  requireAuthenticatedUser(event);

  const gapRecord = await ensureGapRecordForItemCode(event.params.itemCode);

  if (!gapRecord) {
    redirect(302, "/offers-data-quality");
  }

  redirect(302, `/offers-data-quality/${gapRecord.dq_id}`);
};
