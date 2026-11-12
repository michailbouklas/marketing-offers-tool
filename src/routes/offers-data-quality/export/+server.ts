import { error, json } from "@sveltejs/kit";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { generateExcelFile } from "$lib/server/mastra/tools/generate-excel";
import { listBrandsForUser } from "$lib/services/brands.server";
import { getOpenGapList } from "$lib/services/offers-data-quality.server";
import {
  gapListSortDirections,
  gapListSortFields,
  getSelectedBrandAliases,
  parseGapQueueFilters,
} from "$lib/services/offers-data-quality";
import { z } from "zod";
import type { RequestHandler } from "./$types";

// generateExcelFile caps a sheet at 5,000 rows; its 20k-cell cap (~2,850 rows at 7 columns) bites first and is reported to the user.
const EXPORT_PAGE_SIZE = 5_000;

const searchParamsSchema = z.object({
  sortBy: z.enum(gapListSortFields).default("brand"),
  sortDir: z.enum(gapListSortDirections).default("asc"),
  status: z.enum(["submitted"]).optional(),
  itemName: z.string().trim().max(100).optional(),
  itemCode: z.string().trim().max(100).optional(),
});

/**
 * Builds an .xlsx of every gap matching the queue's current brand / status
 * filters and sort (re-queried server-side, unpaged) and returns its
 * download URL.
 */
export const GET: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);
  const params = event.url.searchParams;
  const parsed = searchParamsSchema.safeParse({
    sortBy: params.get("sortBy") ?? undefined,
    sortDir: params.get("sortDir") ?? undefined,
    status: params.get("status") ?? undefined,
    itemName: params.get("itemName") ?? undefined,
    itemCode: params.get("itemCode") ?? undefined,
  });
  const { sortBy, sortDir, status, itemName, itemCode } = parsed.success
    ? parsed.data
    : searchParamsSchema.parse({});

  const brandAliases = getSelectedBrandAliases(
    params.getAll("brandAlias"),
    await listBrandsForUser(user.id),
  );
  const { items } = await getOpenGapList(1, EXPORT_PAGE_SIZE, {
    brandAliases,
    sortBy,
    sortDir,
    statuses: status ? [status] : undefined,
    itemName,
    itemCode,
    ...parseGapQueueFilters(params),
  });

  const result = await generateExcelFile({
    filename: `open-pricing-gaps-${new Date().toISOString().slice(0, 10)}`,
    sheets: [
      {
        name: "Open gaps",
        columns: [
          "Item code",
          "Item",
          "Brand",
          "Transaction category",
          "Missing fields",
          "Status",
          "Detected",
        ],
        rows: items.map((gap) => [
          gap.trde_item,
          gap.item_name,
          gap.brand,
          gap.item_category,
          gap.missing_fields.join(", "),
          gap.status,
          gap.detected_at.slice(0, 10),
        ]),
      },
    ],
  });

  if (!result.ok) {
    console.error(`[offers-data-quality] export failed: ${result.error}`);
    error(500, "The Excel export could not be generated");
  }

  return json({ downloadUrl: result.downloadUrl });
};
