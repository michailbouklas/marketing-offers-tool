import { writeFile } from "node:fs/promises";
import { error, redirect } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import { exportCsvAsXlsx } from "$lib/server/csv-to-xlsx.server";
import { csvField } from "$lib/services/management-accounts";
import { MENU_SHEET_COLUMNS } from "$lib/services/menu";
import { getMenuSheetRows } from "$lib/services/menu.server";
import { requireRecipeBrand } from "$lib/services/recipes.server";
import type { RequestHandler } from "./$types";

const toCsv = (rows: (string | number)[][]) =>
  rows.map((row) => row.map(csvField).join(",")).join("\r\n");

/**
 * GET ?brand= — the import template filled with the brand's current menu (so
 * it round-trips: edit and import it back), plus a "Recipes" sheet listing
 * every recipe name the "Recipe" column accepts.
 */
export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, { recipe: ["manage"] });
  const { brand } = await requireRecipeBrand(
    event,
    event.url.searchParams.get("brand") ?? "",
  );
  const { menu, recipes } = await getMenuSheetRows(brand);

  const menuCsv = toCsv([Object.values(MENU_SHEET_COLUMNS), ...menu]);
  const recipesCsv = toCsv([
    [
      "Recipe",
      "POS code",
      "Category",
      "Cost (EUR)",
      "POS price (EUR)",
      "Cost complete",
    ],
    ...recipes.map((recipe) => [
      recipe.name,
      recipe.item_code,
      recipe.category,
      Math.round(recipe.cost * 10_000) / 10_000,
      recipe.price ?? "",
      recipe.missing === 0 ? "Yes" : "No",
    ]),
  ]);

  let downloadUrl: string;
  try {
    ({ downloadUrl } = await exportCsvAsXlsx(
      `menu-${brand.alias}`,
      (csvPath) => writeFile(csvPath, menuCsv, "utf8"),
      undefined,
      [{ name: "Recipes", csv: recipesCsv }],
    ));
  } catch (cause) {
    console.error("[recipes/menu] template failed:", cause);
    error(500, "The template could not be generated");
  }
  redirect(303, downloadUrl);
};
