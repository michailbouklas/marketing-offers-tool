import { error, json, redirect } from "@sveltejs/kit";
import { writeFile } from "node:fs/promises";
import { requirePermission } from "$lib/server/auth-guards";
import { exportCsvAsXlsx } from "$lib/server/csv-to-xlsx.server";
import { resolveSalesDashboardScope } from "$lib/services/sales-dashboard.server";
import { withSingleBrand } from "$lib/services/sales-dashboard";
import {
  buildSalesCalendar,
  buildSalesHoursGrid,
  isDateView,
  isGroupedByDay,
  WEEKDAY_LABELS,
} from "$lib/services/sales-hours";
import {
  getSalesDayTotals,
  getSalesHourCells,
} from "$lib/services/sales-hours.server";
import type { RequestHandler } from "./$types";

const round2 = (value: number) => Math.round(value * 100) / 100;
const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/**
 * Excel of exactly what /sales/hours shows: same URL filters (brand,
 * location, group, channel, range) and the same `by=day` / `view=dates`
 * grouping. Cells are numbers, ISO dates or fixed labels, so nothing can turn
 * into an officecli formula.
 */
export const POST: RequestHandler = async (event) => {
  const { user } = await requirePermission(event, { sales: ["view"] });
  if (!user) redirect(302, "/login");
  const scope = await resolveSalesDashboardScope(event, user.id);
  if (!scope) error(403, "You are not assigned to any brand");

  const filters = withSingleBrand(scope.filters);
  const byDay = isGroupedByDay(event.url.searchParams);
  const byDate = isDateView(event.url.searchParams);
  const cells = await getSalesHourCells(filters);
  if (cells.length === 0) error(400, "No sales match the current filters");
  const grid = buildSalesHoursGrid(cells, filters.from, filters.to);

  // By date: one row per in-range date, real totals (ISO dates import as Excel dates).
  const dateLines = byDate
    ? buildSalesCalendar(
        await getSalesDayTotals(filters),
        filters.from,
        filters.to,
      ).months.flatMap((month) =>
        month.cells
          .filter((cell) => cell.inRange)
          .map((cell) =>
            [
              cell.date,
              WEEKDAY_LABELS[cell.weekday - 1],
              round2(cell.net),
              cell.txns,
              cell.atv === null ? "" : round2(cell.atv),
            ].join(","),
          ),
      )
    : [];

  const lines = byDate
    ? ["Date,Weekday,Net,Orders,ATV", ...dateLines]
    : byDay
      ? [
          "Weekday,Avg net,Avg orders,ATV",
          ...grid.weekdays.map((cell, index) =>
            [
              WEEKDAY_LABELS[index],
              round2(cell.avgNet),
              round2(cell.avgTxns),
              cell.atv === null ? "" : round2(cell.atv),
            ].join(","),
          ),
        ]
      : [
          "Weekday,Hour,Avg net,Avg orders,ATV,Dead hour",
          ...grid.rows.flatMap((row, index) =>
            row.map((cell, column) =>
              [
                WEEKDAY_LABELS[index],
                hourLabel(grid.hours[column]),
                round2(cell.avgNet),
                round2(cell.avgTxns),
                cell.atv === null ? "" : round2(cell.atv),
                cell.dead ? "Yes" : "",
              ].join(","),
            ),
          ),
        ];

  // Brand and channel come from the scope/URL; sanitizeFilename cleans them.
  const name = [
    "hours",
    filters.brands[0],
    filters.from,
    "to",
    filters.to,
    ...filters.channels,
    ...(byDate ? ["by-date"] : byDay ? ["by-day"] : []),
  ].join("-");

  try {
    const result = await exportCsvAsXlsx(name, (csvPath) =>
      writeFile(csvPath, `${lines.join("\n")}\n`, "utf8"),
    );
    return json({ downloadUrl: result.downloadUrl, rows: lines.length - 1 });
  } catch (cause) {
    console.error(`[sales-hours] export failed:`, cause);
    error(500, "The Excel export could not be generated");
  }
};
