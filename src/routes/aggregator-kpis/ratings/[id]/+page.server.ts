import { requirePermission } from "$lib/server/auth-guards";
import { getKpiStore } from "$lib/services/aggregator-kpis/kpi-shared.server";
import { getRatingsStoreView } from "$lib/services/aggregator-kpis/ratings.server";
import { error } from "@sveltejs/kit";
import { z } from "zod";
import type { PageServerLoad } from "./$types";

const idSchema = z.coerce.number().int().positive();

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { aggregatorKpis: ["view"] });

  const storeId = idSchema.safeParse(event.params.id);

  if (!storeId.success) {
    error(404, "Store not found");
  }

  const store = await getKpiStore(storeId.data);

  if (!store) {
    error(404, "Store not found");
  }

  const view = await getRatingsStoreView(store.id);

  return { store, view };
};
