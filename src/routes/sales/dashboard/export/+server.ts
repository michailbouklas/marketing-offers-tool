import { error, json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import { generateExcelFile } from "$lib/server/mastra/tools/generate-excel";
import {
  buildSalesDashboard,
  buildSalesStoreRows,
  withSingleBrand,
} from "$lib/services/sales-dashboard";
import {
  getSalesDailyTotals,
  getSalesStoreRows,
  resolveSalesDashboardScope,
} from "$lib/services/sales-dashboard.server";
import type { RequestHandler } from "./$types";

const money = (value: number | null) =>
  value === null ? null : Math.round(value * 100) / 100;
const pct = (value: number | null) =>
  value === null ? null : Math.round(value * 10_000) / 100;

/**
 * Builds an .xlsx of the dashboard's current brand + filters (re-queried
 * server-side, never client data) and returns its download URL: daily
 * breakdown, store breakdown and the period comparison.
 */
export const GET: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, { sales: ["view"] });
  const scope = await resolveSalesDashboardScope(event, user.id);

  if (!scope) {
    error(403, "No brands assigned");
  }

  const filters = withSingleBrand(scope.filters);
  const [days, stores] = await Promise.all([
    getSalesDailyTotals(filters),
    getSalesStoreRows(filters),
  ]);
  const dashboard = buildSalesDashboard(days, filters.from, filters.to);
  const brand = filters.brands[0];

  const result = await generateExcelFile({
    filename: `sales-${brand}-${filters.from}-to-${filters.to}`,
    sheets: [
      {
        name: "Daily",
        columns: [
          "Date",
          "Net sales (EUR)",
          "Net sales last year (EUR)",
          "Transactions",
          "Avg ticket (EUR)",
        ],
        rows: dashboard.daily.map((day) => [
          day.day,
          money(day.net),
          money(day.lyNet),
          day.txns,
          money(day.atv),
        ]),
      },
      {
        name: "Stores",
        columns: [
          "Location",
          "Store",
          "Net sales (EUR)",
          "Net sales vs LY (%)",
          "Transactions",
          "Transactions vs LY (%)",
          "Avg ticket (EUR)",
          "Avg ticket vs LY (%)",
        ],
        rows: buildSalesStoreRows(stores).map((row) => [
          row.location,
          row.store,
          money(row.net),
          pct(row.netPct),
          row.txns,
          pct(row.txnsPct),
          money(row.atv),
          pct(row.atvPct),
        ]),
      },
      {
        name: "Periods",
        columns: [
          "Period",
          "Net sales (EUR)",
          "Transactions",
          "Avg ticket (EUR)",
        ],
        rows: dashboard.periods.map((period) => [
          period.label,
          money(period.net),
          period.txns === null ? null : Math.round(period.txns),
          money(period.atv),
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
