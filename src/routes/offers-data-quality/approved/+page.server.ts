import { requireAuthenticatedUser } from "$lib/server/auth-guards";
import { listApprovedOffers } from "$lib/services/offers-data-quality.server";
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { readApprovedOffersQuery } from "./filters.server";

const PAGE_SIZE = 50;

export const load: PageServerLoad = async (event) => {
  const { user } = requireAuthenticatedUser(event);

  if (!user) {
    redirect(302, "/login");
  }

  const { brands, selectedBrandAliases, filters, page } =
    await readApprovedOffersQuery(event.url, user.id);
  const { items, totalItems } = await listApprovedOffers(
    selectedBrandAliases,
    filters,
    page,
    PAGE_SIZE,
  );

  return {
    offers: items,
    totalItems,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(totalItems / PAGE_SIZE)),
    brands,
    selectedBrandAliases,
    filters,
  };
};
