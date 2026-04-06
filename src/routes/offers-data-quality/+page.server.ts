import { listBrandsForUser } from "$lib/services/brands.server";
import { requireAuthenticatedUser } from "$lib/server/auth-guards";
import { getOpenGapList } from "$lib/services/offers-data-quality.server";
import {
  gapListSortDirections,
  gapListSortFields,
  getSelectedBrandAliases,
} from "$lib/services/offers-data-quality";
import { redirect } from "@sveltejs/kit";
import { z } from "zod";
import type { PageServerLoad } from "./$types";

const searchParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  sortBy: z.enum(gapListSortFields).default("brand"),
  sortDir: z.enum(gapListSortDirections).default("asc"),
});

const PAGE_SIZE = 50;

export const load: PageServerLoad = async (event) => {
  const { user } = requireAuthenticatedUser(event);

  if (!user) {
    redirect(302, "/login");
  }

  const parseResult = searchParamsSchema.safeParse({
    page: event.url.searchParams.get("page") ?? 1,
    sortBy: event.url.searchParams.get("sortBy") ?? undefined,
    sortDir: event.url.searchParams.get("sortDir") ?? undefined,
  });
  const page = parseResult.success ? parseResult.data.page : 1;
  const sortBy = parseResult.success ? parseResult.data.sortBy : "brand";
  const sortDir = parseResult.success ? parseResult.data.sortDir : "asc";
  const userBrands = await listBrandsForUser(user.id);
  const selectedBrandAliases = getSelectedBrandAliases(
    event.url.searchParams.getAll("brandAlias"),
    userBrands,
  );
  const gapsPage = await getOpenGapList(page, PAGE_SIZE, {
    brandAliases: selectedBrandAliases,
    sortBy,
    sortDir,
  });

  return {
    gapsPage,
    brands: userBrands,
    selectedBrandAliases,
    sortBy,
    sortDir,
  };
};
