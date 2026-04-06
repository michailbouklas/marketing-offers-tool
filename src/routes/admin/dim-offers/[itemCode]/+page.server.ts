import { error } from "@sveltejs/kit";
import { requireAdminUser } from "$lib/server/auth-guards";
import { getAdminDimOfferAuditPageData } from "$lib/services/admin-dim-offers.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requireAdminUser(event);

  const itemCode = event.params.itemCode?.trim();

  if (!itemCode) {
    throw error(404, "Item code is required");
  }

  const data = await getAdminDimOfferAuditPageData(itemCode);

  if (!data.item && data.audits.length === 0) {
    throw error(404, "No dim_offers row or audit history found for this item");
  }

  return {
    itemCode,
    ...data,
  };
};
