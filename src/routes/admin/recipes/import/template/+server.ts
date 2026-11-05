import { error, json } from "@sveltejs/kit";
import { requireApiPermission } from "$lib/server/auth-guards";
import { generateExcelFile } from "$lib/server/mastra/tools/generate-excel";
import { RECIPE_IMPORT_COLUMNS } from "$lib/services/recipe-import";
import {
  listMenuItems,
  requireRecipeBrand,
} from "$lib/services/recipes.server";
import type { RequestHandler } from "./$types";

// generateExcelFile caps a sheet at 5,000 rows.
const MAX_MENU_ROWS = 5_000;

/**
 * GET ?brand=<alias> → `{ downloadUrl }` of an empty import sheet plus a
 * read-only "Menu items" sheet with the exact codes and names to copy from.
 * The import only reads the first sheet.
 */
export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, { recipe: ["manage"] });
  const { brand } = await requireRecipeBrand(
    event,
    event.url.searchParams.get("brand") ?? "",
  );
  const menu = (await listMenuItems(brand.alias)).filter((item) => item.active);

  const result = await generateExcelFile({
    filename: `recipe-import-${brand.alias}`,
    sheets: [
      { name: "Recipes", columns: [...RECIPE_IMPORT_COLUMNS], rows: [] },
      {
        name: "Menu items",
        columns: ["Item code", "Item name", "Category"],
        rows: menu
          .slice(0, MAX_MENU_ROWS)
          .map((item) => [item.item_code, item.description, item.category]),
      },
    ],
  });

  if (!result.ok) {
    console.error(`[recipes/import] template failed: ${result.error}`);
    error(500, "The template could not be generated");
  }
  return json({ downloadUrl: result.downloadUrl });
};
