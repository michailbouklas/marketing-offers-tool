import { z } from "zod";
import { requireAdminUser } from "$lib/server/auth-guards";
import { getAuthenticatedUserRole } from "$lib/server/auth-guards";
import {
  adminDimOffersSortDirections,
  adminDimOffersSortFields,
} from "$lib/services/admin-dim-offers";
import { listBrands } from "$lib/services/brands.server";
import { listAdminDimOffersPage } from "$lib/services/admin-dim-offers.server";
import type { PageServerLoad } from "./$types";

const PAGE_SIZE = 50;

const searchParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  query: z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().trim().min(1).optional()),
  brandAlias: z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().trim().min(1).optional()),
  sortBy: z.enum(adminDimOffersSortFields).default("item_code"),
  sortDir: z.enum(adminDimOffersSortDirections).default("asc"),
});

export const load: PageServerLoad = async (event) => {
  await requireAdminUser(event);

  const brands = await listBrands({ active: true });
  const userRole = await getAuthenticatedUserRole(event);
  const allowedBrandAliases = new Set(
    brands
      .map((brand) => brand.alias.trim())
      .filter((alias) => alias.length > 0),
  );
  const parseResult = searchParamsSchema.safeParse({
    page: event.url.searchParams.get("page") ?? 1,
    query: event.url.searchParams.get("query") ?? undefined,
    brandAlias: event.url.searchParams.get("brandAlias") ?? undefined,
    sortBy: event.url.searchParams.get("sortBy") ?? undefined,
    sortDir: event.url.searchParams.get("sortDir") ?? undefined,
  });
  const page = parseResult.success ? parseResult.data.page : 1;
  const query = parseResult.success ? (parseResult.data.query ?? null) : null;
  const sortBy = parseResult.success ? parseResult.data.sortBy : "item_code";
  const sortDir = parseResult.success ? parseResult.data.sortDir : "asc";
  const selectedBrandAlias =
    parseResult.success &&
    parseResult.data.brandAlias &&
    allowedBrandAliases.has(parseResult.data.brandAlias)
      ? parseResult.data.brandAlias
      : null;

  return {
    brands,
    userRole,
    query,
    sortBy,
    sortDir,
    selectedBrandAlias,
    dimOffersPage: await listAdminDimOffersPage({
      page,
      pageSize: PAGE_SIZE,
      query,
      brandAlias: selectedBrandAlias,
      sortBy,
      sortDir,
    }),
  };
};
