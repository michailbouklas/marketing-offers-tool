import { error, json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import { generateExcelFile } from "$lib/server/mastra/tools/generate-excel";
import { buildSalesDayRows } from "$lib/services/sales-dashboard";
import {
  getSalesDayBrandRows,
  resolveSalesDashboardScope,
} from "$lib/services/sales-dashboard.server";
import type { RequestHandler } from "./$types";

/**
 * Builds an .xlsx of the dashboard's current filters (re-queried server-side,
 * never client data) and returns its download URL. Wide layout — one row per
 * day, a transactions + net sales column pair per brand — keeps a full year
 * of every brand under generateExcelFile's cell cap.
 */
export const GET: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, { sales: ["view"] });
  const scope = await resolveSalesDashboardScope(event, user.id);

  if (!scope) {
    error(403, "No brands assigned");
  }

  const { filters } = scope;
  const names = new Map(scope.brands.map((brand) => [brand.alias, brand.name]));
  const days = buildSalesDayRows(
    await getSalesDayBrandRows(filters),
    filters.brands,
    filters.from,
    filters.to,
  );

  const result = await generateExcelFile({
    filename: `sales-${filters.from}-to-${filters.to}`,
    sheets: [
      {
        name: "Sales",
        columns: [
          "Date",
          ...filters.brands.flatMap((alias) => [
            `${names.get(alias) ?? alias} transactions`,
            `${names.get(alias) ?? alias} net sales (EUR)`,
          ]),
        ],
        rows: days.map((day) => [
          day.day,
          ...filters.brands.flatMap((alias) => [
            day.byBrand[alias].txns,
            Math.round(day.byBrand[alias].net * 100) / 100,
          ]),
        ]),
      },
    ],
  });

  if (!result.ok) {
    console.error(`[sales-dashboard] export failed: ${result.error}`);
    error(500, "The Excel export could not be generated");
  }

  return json({ downloadUrl: result.downloadUrl });
};
