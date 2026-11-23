import { error, json } from "@sveltejs/kit";
import { writeFile } from "node:fs/promises";
import { requireApiPermission } from "$lib/server/auth-guards";
import { exportCsvAsXlsx } from "$lib/server/csv-to-xlsx.server";
import { withSingleBrand } from "$lib/services/sales-dashboard";
import { resolveSalesDashboardScope } from "$lib/services/sales-dashboard.server";
import {
  parseOfferDateRange,
  parseOfferLocations,
  scopeOfferLocations,
} from "$lib/services/sales-offers";
import { getOfferFilterOptions } from "$lib/services/sales-offers.server";
import {
  buildItemAnalysisMonths,
  parseItemAnalysisParams,
  type ItemAnalysisFigures,
} from "$lib/services/sales-item-analysis";
import {
  getItemAnalysisCategories,
  getItemAnalysisRows,
} from "$lib/services/sales-item-analysis.server";
import type { RequestHandler } from "./$types";

const money = (value: number) => Math.round(value * 100) / 100;
const pct = (value: number, digits = 2) =>
  Math.round(value * 100 * 10 ** digits) / 10 ** digits;
// Quoted CSV text (names may hold commas); a leading space defuses `=` (officecli import makes formulas).
const csvText = (value: string) =>
  `"${(value.startsWith("=") ? ` ${value}` : value).replaceAll('"', '""')}"`;

const COLUMNS = [
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
];

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

/**
 * .xlsx of the page's report, re-queried server-side from the URL filters
 * (never client data): brand, range, channels, cities/locations, categories
 * and Group by month. Grouped, a leading Month column repeats the page's
 * per-month tables (own category and grand totals) in one filterable sheet.
 * CSV import, not generateExcelFile: its 20k-cell cap fails a 2-month export.
 */
export const GET: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, { sales: ["view"] });
  const scope = await resolveSalesDashboardScope(event, user.id);
  if (!scope) error(403, "No brands assigned");

  const filters = withSingleBrand(scope.filters);
  const brand = filters.brands[0];
  // Same defaults, city → location and category resolution as the page, so the file matches it.
  const range = parseOfferDateRange(event.url.searchParams) ?? {
    from: filters.from,
    to: filters.to,
  };
  const [{ locations: locationOptions }, categoryOptions] = await Promise.all([
    getOfferFilterOptions(filters, range),
    getItemAnalysisCategories(brand, range),
  ]);
  const { scoped: locations } = scopeOfferLocations(
    locationOptions,
    parseOfferLocations(event.url.searchParams),
    filters.cities ?? [],
  );
  const { categories, byMonth } = parseItemAnalysisParams(
    event.url.searchParams,
    categoryOptions,
  );
  const entries = buildItemAnalysisMonths(
    await getItemAnalysisRows(brand, range, filters.channels, locations, {
      categories,
      byMonth,
    }),
  );

  const lines = [
    [...(byMonth ? ["Month"] : []), ...COLUMNS].join(","),
    ...entries.flatMap(({ month, report }) => {
      const lead = byMonth ? [(month ?? "").slice(0, 7)] : [];
      return [
        ...report.groups.flatMap((group) => [
          ...group.items.map((item) => [
            ...lead,
            csvText(group.category),
            csvText(item.code),
            csvText(item.name),
            ...figures(item),
          ]),
          [
            ...lead,
            csvText(group.category),
            "",
            csvText(`${group.category} total`),
            ...figures(group.total),
          ],
        ]),
        [
          ...lead,
          "",
          "",
          "Grand total",
          report.grand.qty,
          "",
          "",
          "",
          report.grand.trans,
          "",
          "",
          money(report.grand.net),
          "",
          "",
        ],
      ].map((cells) => cells.join(","));
    }),
  ];

  try {
    const result = await exportCsvAsXlsx(
      `item-analysis-${brand}-${range.from}-to-${range.to}${filters.channels.length > 0 ? `-${filters.channels.join("-")}` : ""}${locations.length > 0 ? `-${locations.length}-locations` : ""}${categories.length > 0 ? `-${categories.length}-categories` : ""}${byMonth ? "-by-month" : ""}`,
      (csvPath) => writeFile(csvPath, `${lines.join("\n")}\n`, "utf8"),
    );
    return json({ downloadUrl: result.downloadUrl });
  } catch (cause) {
    console.error(`[item-analysis] export failed:`, cause);
    error(500, "The Excel export could not be generated");
  }
};
