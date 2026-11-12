import { error, json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import { generateExcelFile } from "$lib/server/mastra/tools/generate-excel";
import {
  buildConsolidatedReport,
  parseConsolidatedExtras,
  WEEKDAY_OPTIONS,
  type ConsolidatedTotals,
} from "$lib/services/sales-consolidated";
import { getConsolidatedRows } from "$lib/services/sales-consolidated.server";
import { resolveSalesDashboardScope } from "$lib/services/sales-dashboard.server";
import type { RequestHandler } from "./$types";

const round2 = (value: number | null) =>
  value === null ? null : Math.round(value * 100) / 100;
const totalCells = (total: ConsolidatedTotals) => [
  total.trans,
  round2(total.gross),
  round2(total.discount),
  round2(total.net),
  round2(total.avgGross),
  round2(total.avgNet),
];
const SHEET = "Report";
const LAST_COLUMN = "I";

/**
 * Excel of the report for the same URL filters, re-queried server-side
 * (never client numbers). Subtotal and total rows are bold; text cells
 * starting with "=" are neutralised by generateExcelFile.
 */
export const GET: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, { sales: ["view"] });
  const scope = await resolveSalesDashboardScope(event, user.id);
  if (!scope) error(403, "No brands assigned");

  const { filters } = scope;
  const extras = parseConsolidatedExtras(event.url.searchParams);
  const report = buildConsolidatedReport(
    await getConsolidatedRows(filters, extras),
  );
  if (report.groups.length === 0) {
    error(400, "No sales match the current filters");
  }

  const rows: (string | number | null)[][] = [];
  const boldRows: number[] = [];
  for (const group of report.groups) {
    for (const row of group.rows) {
      rows.push([group.label, row.location, row.city, ...totalCells(row)]);
    }
    rows.push([`${group.label} total`, null, null, ...totalCells(group.total)]);
    boldRows.push(rows.length + 1); // +1: row 1 is the header
  }
  rows.push(["Total sales", null, null, ...totalCells(report.total)]);
  boldRows.push(rows.length + 1);

  const lastRow = rows.length + 1;
  const all = (values: string[], fallback: string) =>
    values.length === 0 ? fallback : values.join(", ");
  const brandNames = scope.brands
    .filter((brand) => filters.brands.includes(brand.alias))
    .map((brand) => brand.name);
  const days = WEEKDAY_OPTIONS.filter((day) =>
    extras.weekdays.includes(day.value),
  ).map((day) => day.label);

  const result = await generateExcelFile({
    filename: `consolidated-sales-${filters.from}-to-${filters.to}`,
    sheets: [
      {
        name: SHEET,
        columns: [
          "Company",
          "Location",
          "City",
          "Trans",
          "Gross (EUR)",
          "Discount (EUR)",
          "Net (EUR)",
          "Avg gross / trans (EUR)",
          "Avg net / trans (EUR)",
        ],
        rows,
      },
      {
        name: "Filters",
        columns: ["Filter", "Value"],
        rows: [
          ["From", filters.from],
          ["To", filters.to],
          [
            "Brands",
            brandNames.length === scope.brands.length
              ? "All brands"
              : brandNames.join(", "),
          ],
          ["Channels", all(filters.channels, "All channels")],
          ["Cities", all(extras.cities, "All cities")],
          ["Locations", all(extras.stores, "All locations")],
          ["Weekdays", all(days, "All days")],
        ],
      },
    ],
    extraCommands: [
      ...boldRows.map((row) => ({
        command: "set",
        path: `/${SHEET}/A${row}:${LAST_COLUMN}${row}`,
        props: { bold: "true" },
      })),
      {
        command: "set",
        path: `/${SHEET}/E2:${LAST_COLUMN}${lastRow}`,
        props: { numberformat: "#,##0.00" },
      },
      {
        command: "set",
        path: `/${SHEET}`,
        props: { freeze: "A2" },
      },
    ],
  });

  if (!result.ok) {
    console.error(`[sales-consolidated] export failed: ${result.error}`);
    error(500, "The Excel export could not be generated");
  }

  return json({ downloadUrl: result.downloadUrl });
};
