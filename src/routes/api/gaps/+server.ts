import { json } from "@sveltejs/kit";
import { requireAuthenticatedUser } from "$lib/server/auth-guards";
import { listBrandsForUser } from "$lib/services/brands.server";
import { getOpenGapList } from "$lib/services/offers-data-quality.server";
import {
  gapListSortDirections,
  gapListSortFields,
  getSelectedBrandAliases,
} from "$lib/services/offers-data-quality";
import { z } from "zod";
import type { RequestHandler } from "./$types";

const PAGE_SIZE = 50;

const searchParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  sortBy: z.enum(gapListSortFields).default("brand"),
  sortDir: z.enum(gapListSortDirections).default("asc"),
});

export const GET: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedUser(event);

  if (!user) {
    return json({ error: "Authentication required" }, { status: 401 });
  }

  const parseResult = searchParamsSchema.safeParse({
    page: event.url.searchParams.get("page") ?? 1,
    sortBy: event.url.searchParams.get("sortBy") ?? undefined,
    sortDir: event.url.searchParams.get("sortDir") ?? undefined,
  });
  const page = parseResult.success ? parseResult.data.page : 1;
  const sortBy = parseResult.success ? parseResult.data.sortBy : "brand";
  const sortDir = parseResult.success ? parseResult.data.sortDir : "asc";
  const brands = await listBrandsForUser(user.id);
  const selectedBrandAliases = getSelectedBrandAliases(
    event.url.searchParams.getAll("brandAlias"),
    brands,
  );
  const gapsPage = await getOpenGapList(page, PAGE_SIZE, {
    brandAliases: selectedBrandAliases,
    sortBy,
    sortDir,
  });

  return json({
    gapsPage,
    selectedBrandAliases,
    sortBy,
    sortDir,
  });
};
