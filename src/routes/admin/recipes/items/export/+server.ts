import { writeFile } from "node:fs/promises";
import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { requireApiPermission } from "$lib/server/auth-guards";
import { exportCsvAsXlsx } from "$lib/server/csv-to-xlsx.server";
import { csvField } from "$lib/services/management-accounts";
import { foodCostPercent } from "$lib/services/recipes";
import {
  listRecipeRows,
  requireRecipeBrand,
} from "$lib/services/recipes.server";
import type { RequestHandler } from "./$types";

const bodySchema = z.object({
  brand: z.string().max(100),
  /** Row keys in grid order, after the page toggles and the grid's filters. */
  keys: z.array(z.string().max(120)).min(1).max(20_000),
});

const HEADER = [
  "Recipe / item",
  "Status",
  "POS code",
  "POS name",
  "Category",
  "Active",
  "Materials",
  "Materials without cost",
  "Cost (EUR)",
  "POS price (EUR)",
  "Food cost %",
  "Updated",
];

/**
 * Excel of the rows the recipe grid shows. The browser sends only which rows
 * (and in what order); names and costs are re-read here, so the file never
 * carries client-supplied values. Food cost % is without labour.
 */
export const POST: RequestHandler = async (event) => {
  await requireApiPermission(event, { recipe: ["manage"] });
  const parsed = bodySchema.safeParse(
    await event.request.json().catch(() => null),
  );
  if (!parsed.success) error(400, "Invalid export request");
  const { brand } = await requireRecipeBrand(event, parsed.data.brand);

  const byKey = new Map(
    (await listRecipeRows(brand)).map((row) => [row.key, row]),
  );
  const lines = [HEADER];
  for (const key of parsed.data.keys) {
    const row = byKey.get(key);
    if (!row) continue;
    const foodCost =
      row.cost !== null && row.price !== null && row.missing === 0
        ? foodCostPercent(row.cost, row.price)
        : null;
    lines.push(
      [
        row.name,
        row.status,
        row.item_code,
        row.pos_name,
        row.category,
        row.active ? "Yes" : "No",
        row.materials,
        row.missing,
        row.cost ?? "",
        row.price ?? (row.no_pos_price ? "no POS price" : ""),
        foodCost === null ? "" : Math.round(foodCost * 100) / 100,
        row.updated,
      ].map(String),
    );
  }
  if (lines.length === 1) error(400, "None of these rows exist any more");
  const csv = lines.map((line) => line.map(csvField).join(",")).join("\r\n");

  try {
    const result = await exportCsvAsXlsx(`recipes-${brand.alias}`, (csvPath) =>
      writeFile(csvPath, csv, "utf8"),
    );
    return json({ downloadUrl: result.downloadUrl });
  } catch (cause) {
    console.error("[recipes] export failed:", cause);
    error(500, "The Excel export could not be generated");
  }
};
