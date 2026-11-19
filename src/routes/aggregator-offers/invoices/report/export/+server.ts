import { error, json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import { exportCsvAsXlsx } from "$lib/server/csv-to-xlsx.server";
import { invoiceAggregatorLabel } from "$lib/services/aggregator-invoices/aggregator-invoices";
import { getMktReportRows } from "$lib/services/aggregator-invoices/mkt-report.server";
import { formatBrandLabel } from "$lib/services/brands";
import { writeFile } from "node:fs/promises";
import { resolveMktReportFilters } from "../filters.server";
import type { RequestHandler } from "./$types";

const round2 = (value: number) => Math.round(value * 100) / 100;
// Quoted CSV text; a leading space defuses `=` (officecli import makes formulas).
const csvText = (value: string) =>
  `"${(value.startsWith("=") ? ` ${value}` : value).replaceAll('"', '""')}"`;

const HEADER = [
  "Aggregator",
  "Store",
  "Month",
  "Net",
  "VAT",
  "Gross",
  "MKT_DEL gross",
  "Lines",
  "Invoices",
  "Sales",
];

/**
 * Excel of the marketing report for the same URL filters, re-queried
 * server-side (never client numbers): a flat Sheet1 (aggregator × store ×
 * month, autofiltered), a Pivot sheet over it, and a Filters sheet.
 */
export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, { aggregatorInvoices: ["view"] });

  const { params, brands, filters } = await resolveMktReportFilters(event.url);
  const rows = await getMktReportRows(filters);
  if (rows.length === 0) {
    error(400, "No marketing lines match the current filters");
  }
  rows.sort(
    (a, b) =>
      a.month.localeCompare(b.month) ||
      a.store.localeCompare(b.store) ||
      a.aggregator.localeCompare(b.aggregator),
  );

  const lines = [
    HEADER.join(","),
    ...rows.map((row) =>
      [
        invoiceAggregatorLabel(row.aggregator),
        csvText(row.store),
        // Text, not a date: keeps the pivot Month filter as plain YYYY-MM items.
        csvText(row.month),
        round2(row.net),
        round2(row.vat),
        round2(row.gross),
        round2(row.deliveryGross),
        row.lines,
        row.invoices,
        round2(row.salesGross),
      ].join(","),
    ),
  ];

  const all = (values: string[], fallback: string) =>
    values.length === 0 ? fallback : values.join(", ");
  const filterRows: [string, string][] = [
    ["Line types", "Wolt MKT; Bolt MKT + MKT_DEL"],
    ["Aggregators", all(params.aggregators.map(invoiceAggregatorLabel), "All")],
    [
      "Brands",
      all(
        brands
          .filter((brand) => params.brands.includes(brand.id))
          .map(formatBrandLabel),
        "All brands",
      ),
    ],
    ["Stores", all(params.stores, "All stores")],
    ["Invoice #", params.invoiceNumber ?? "Any"],
    ["Line details", params.lineDetails ?? "Any"],
    ["From", params.from ?? "Start"],
    ["To", params.to ?? "Today"],
    [
      "Notes",
      "Amounts in EUR; Gross incl. VAT. Sales = SAL gross on the same invoices. Marketing % of sales is computed from the summed Gross and Sales, so it stays correct under any pivot filter.",
    ],
  ];

  try {
    const result = await exportCsvAsXlsx(
      `marketing-invoices-${params.from ?? "start"}-to-${params.to ?? "today"}`,
      (csvPath) => writeFile(csvPath, `${lines.join("\n")}\n`, "utf8"),
      {
        source: `Sheet1!A1:J${lines.length}`,
        position: "A3",
        rows: "Store",
        cols: "Aggregator",
        filters: "Month",
        values: "Gross:sum,Net:sum",
        // Summed Gross / summed Sales; never sum a per-row percentage.
        calculatedField: "Marketing % of sales:=Gross*100/Sales",
        layout: "tabular",
      },
      [
        {
          name: "Filters",
          csv: `Filter,Value\n${filterRows.map(([key, value]) => `${csvText(key)},${csvText(value)}`).join("\n")}\n`,
        },
      ],
    );
    return json({ downloadUrl: result.downloadUrl });
  } catch (cause) {
    console.error(`[invoices-mkt-report] export failed:`, cause);
    error(500, "The Excel export could not be generated");
  }
};
