import { z } from "zod";
import { error, json, redirect } from "@sveltejs/kit";
import { writeFile } from "node:fs/promises";
import { requirePermission } from "$lib/server/auth-guards";
import { exportCsvAsXlsx } from "$lib/server/csv-to-xlsx.server";
import { resolveSalesDashboardScope } from "$lib/services/sales-dashboard.server";
import { getSalesMonthHourCells } from "$lib/services/sales-hours.server";
import { DAYPARTS, daypartLabel } from "$lib/services/sales-hours";
import type { RequestHandler } from "./$types";

const round2 = (value: number) => Math.round(value * 100) / 100;
const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
// Brand, city, store, location and channel names may contain commas.
const csvText = (value: string) => `"${value.replaceAll('"', '""')}"`;

// Numbered so the pivot (which sorts labels A-Z) lists dayparts in day order.
const daypartSortLabel = (hour: number) => {
  const label = daypartLabel(hour);
  return `${DAYPARTS.findIndex((part) => part.label === label) + 1} ${label}`;
};

const bodySchema = z.object({ brands: z.array(z.string()).min(1) });

/**
 * Excel of net sales and orders per brand × location × month × hour for the
 * brands picked in the export popover, over the page's date range, with channel as a column
 * (the page's channel filter is ignored). Picked brands are intersected with the user's scope, so the export
 * cannot widen access.
 */
export const POST: RequestHandler = async (event) => {
  const { user } = await requirePermission(event, { sales: ["view"] });
  if (!user) redirect(302, "/login");
  const scope = await resolveSalesDashboardScope(event, user.id);
  if (!scope) error(403, "You are not assigned to any brand");

  const body = bodySchema.safeParse(
    await event.request.json().catch(() => null),
  );
  if (!body.success) error(400, "Pick at least one brand");
  // Only brands in the user's scope survive, whatever the client sent.
  const picked = new Set(body.data.brands);
  const brands = scope.brands.filter((brand) => picked.has(brand.alias));
  if (brands.length === 0) error(400, "Pick at least one brand");

  const { from, to } = scope.filters;
  const names = new Map(brands.map((brand) => [brand.alias, brand.name]));
  const cells = await getSalesMonthHourCells(from, to, [...names.keys()]);
  if (cells.length === 0) error(400, "No sales in this date range");

  const lines = [
    "Brand,City,Store,Location,Channel,Month,Part of day,Hour,Net,Orders,ATV",
    ...cells.map((cell) =>
      [
        csvText(names.get(cell.brand) ?? cell.brand),
        csvText(cell.city),
        csvText(cell.store),
        csvText(cell.location),
        csvText(cell.channel),
        cell.month,
        daypartSortLabel(cell.hour),
        hourLabel(cell.hour),
        round2(cell.net),
        cell.txns,
        cell.txns === 0 ? "" : round2(cell.net / cell.txns),
      ].join(","),
    ),
  ];

  try {
    const result = await exportCsvAsXlsx(
      `hours-per-month-${from}-to-${to}`,
      (csvPath) => writeFile(csvPath, `${lines.join("\n")}\n`, "utf8"),
      {
        source: `Sheet1!A1:K${lines.length}`,
        position: "A3",
        rows: "Part of day,Hour",
        cols: "Channel",
        filters: "Brand,City,Store,Month",
        values: "Net:sum,Orders:sum",
        // Summed Net / summed Orders; summing the row-level ATV column is wrong.
        calculatedField: "Net per order:=Net/Orders",
        layout: "tabular",
      },
    );
    return json({ downloadUrl: result.downloadUrl, rows: cells.length });
  } catch (cause) {
    console.error(`[sales-hours] month export failed:`, cause);
    error(500, "The Excel export could not be generated");
  }
};
