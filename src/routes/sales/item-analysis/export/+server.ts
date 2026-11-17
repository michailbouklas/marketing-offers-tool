import { error, json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import { generateExcelFile } from "$lib/server/mastra/tools/generate-excel";
import { withSingleBrand } from "$lib/services/sales-dashboard";
import { resolveSalesDashboardScope } from "$lib/services/sales-dashboard.server";
import {
  parseOfferDateRange,
  parseOfferLocations,
  scopeOfferLocations,
} from "$lib/services/sales-offers";
import { getOfferFilterOptions } from "$lib/services/sales-offers.server";
import {
  buildItemAnalysis,
  type ItemAnalysisFigures,
} from "$lib/services/sales-item-analysis";
import { getItemAnalysisRows } from "$lib/services/sales-item-analysis.server";
import type { RequestHandler } from "./$types";

const money = (value: number) => Math.round(value * 100) / 100;
const pct = (value: number, digits = 2) =>
  Math.round(value * 100 * 10 ** digits) / 10 ** digits;

const figures = (row: ItemAnalysisFigures) => [
  row.qty,
  pct(row.qtyGrp),
  pct(row.qtyTot),
  pct(row.qtyPerTrans, 3),
  row.trans,
  pct(row.transGrp),
  pct(row.transTot),
  money(row.net),
  pct(row.netGrp),
  pct(row.netTot),
];

/** .xlsx of the page's report, re-queried server-side from the URL filters (never client data). */
export const GET: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, { sales: ["view"] });
  const scope = await resolveSalesDashboardScope(event, user.id);
  if (!scope) error(403, "No brands assigned");

  const filters = withSingleBrand(scope.filters);
  const brand = filters.brands[0];
  // Same defaults and city → location resolution as the page, so the file matches it.
  const range = parseOfferDateRange(event.url.searchParams) ?? {
    from: filters.from,
    to: filters.to,
  };
  const { locations: locationOptions } = await getOfferFilterOptions(
    filters,
    range,
  );
  const { scoped: locations } = scopeOfferLocations(
    locationOptions,
    parseOfferLocations(event.url.searchParams),
    filters.cities ?? [],
  );
  const report = buildItemAnalysis(
    await getItemAnalysisRows(brand, range, filters.channels, locations),
  );

  const result = await generateExcelFile({
    filename: `item-analysis-${brand}-${range.from}-to-${range.to}${filters.channels.length > 0 ? `-${filters.channels.join("-")}` : ""}${locations.length > 0 ? `-${locations.length}-locations` : ""}`,
    sheets: [
      {
        name: "Item analysis",
        columns: [
          "Category",
          "Code",
          "Item",
          "Quantity",
          "Qty Grp %",
          "Qty Tot %",
          "Qty/Tr %",
          "Trans",
          "Trans Grp %",
          "Trans Tot %",
          "Net sales (EUR)",
          "Net Grp %",
          "Net Tot %",
        ],
        rows: [
          ...report.groups.flatMap((group) => [
            ...group.items.map((item) => [
              group.category,
              item.code,
              item.name,
              ...figures(item),
            ]),
            [
              group.category,
              "",
              `${group.category} total`,
              ...figures(group.total),
            ],
          ]),
          [
            "",
            "",
            "Grand total",
            report.grand.qty,
            null,
            null,
            null,
            report.grand.trans,
            null,
            null,
            money(report.grand.net),
            null,
            null,
          ],
        ],
      },
    ],
  });

  if (!result.ok) {
    console.error(`[item-analysis] export failed: ${result.error}`);
    error(500, "The Excel export could not be generated");
  }

  return json({ downloadUrl: result.downloadUrl });
};
