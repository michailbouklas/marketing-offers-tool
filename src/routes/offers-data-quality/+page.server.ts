import { listBrandsForUser } from "$lib/services/brands.server";
import {
  hasPermission,
  requireAuthenticatedUser,
} from "$lib/server/auth-guards";
import {
  getGapQueueFilterOptionsForBrands,
  getGapQueueStatus,
  getOpenGapList,
} from "$lib/services/offers-data-quality.server";
import {
  gapListSortDirections,
  gapListSortFields,
  getSelectedBrandAliases,
  parseGapQueueFilters,
} from "$lib/services/offers-data-quality";
import { redirect } from "@sveltejs/kit";
import { z } from "zod";
import type { PageServerLoad } from "./$types";

const searchParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  sortBy: z.enum(gapListSortFields).default("brand"),
  sortDir: z.enum(gapListSortDirections).default("asc"),
  status: z.enum(["submitted"]).optional(),
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
    status: event.url.searchParams.get("status") ?? undefined,
  });
  const page = parseResult.success ? parseResult.data.page : 1;
  const sortBy = parseResult.success ? parseResult.data.sortBy : "brand";
  const sortDir = parseResult.success ? parseResult.data.sortDir : "asc";
  const statusFilter = parseResult.success
    ? (parseResult.data.status ?? null)
    : null;
  const userBrands = await listBrandsForUser(user.id);
  const selectedBrandAliases = getSelectedBrandAliases(
    event.url.searchParams.getAll("brandAlias"),
    userBrands,
  );
  const filters = parseGapQueueFilters(event.url.searchParams);
  const gapsPage = await getOpenGapList(page, PAGE_SIZE, {
    brandAliases: selectedBrandAliases,
    sortBy,
    sortDir,
    statuses: statusFilter ? [statusFilter] : undefined,
    ...filters,
  });
  const [queueStatus, canDismiss, filterOptions] = await Promise.all([
    getGapQueueStatus(),
    hasPermission(event, { submission: ["reject"] }),
    getGapQueueFilterOptionsForBrands(selectedBrandAliases),
  ]);

  return {
    gapsPage,
    brands: userBrands,
    selectedBrandAliases,
    filters,
    filterOptions,
    sortBy,
    sortDir,
    statusFilter,
    snapshotRefreshedAt: queueStatus.refreshedAt,
    canDismiss,
  };
};
