import { error, json } from "@sveltejs/kit";
import { readSheet } from "read-excel-file/node";
import { requireApiPermission } from "$lib/server/auth-guards";
import {
  MAX_MENU_IMPORT_BYTES,
  MAX_MENU_IMPORT_ROWS,
  MENU_SHEET_COLUMNS,
  parseMenuSheet,
} from "$lib/services/menu";
import { importMenu, listRecipeOptions } from "$lib/services/menu.server";
import {
  cellText,
  normalize,
  type ImportCell,
} from "$lib/services/recipe-import";
import { requireRecipeBrand } from "$lib/services/recipes.server";
import {
  getSapItemsByNumber,
  resolveSapCompany,
} from "$lib/services/sap-items.server";
import type { RequestHandler } from "./$types";

/**
 * POST multipart `brand` (alias) + `file` (.xlsx, first sheet in the template
 * format). All or nothing: any row problem answers `{ errors }` and writes
 * nothing; otherwise `{ created, updated }`.
 */
export const POST: RequestHandler = async (event) => {
  const { user } = await requireApiPermission(event, { recipe: ["manage"] });
  const form = await event.request.formData();
  const { brand } = await requireRecipeBrand(
    event,
    String(form.get("brand") ?? ""),
  );

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    error(400, "Choose an .xlsx file to import");
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    error(400, "Only .xlsx files are supported");
  }
  if (file.size > MAX_MENU_IMPORT_BYTES) {
    error(
      413,
      `The file is larger than ${MAX_MENU_IMPORT_BYTES / 1024 / 1024} MB`,
    );
  }

  let sheet: ImportCell[][];
  try {
    sheet = (await readSheet(
      Buffer.from(await file.arrayBuffer()),
    )) as ImportCell[][];
  } catch {
    error(400, "The file could not be read as an Excel workbook");
  }
  if (sheet.length - 1 > MAX_MENU_IMPORT_ROWS) {
    error(400, `The file has more than ${MAX_MENU_IMPORT_ROWS} rows`);
  }

  // Every "Recipe or material" cell is looked up in SAP once; the parser uses
  // a SAP row only when the text is not a recipe.
  const column = sheet[0]?.findIndex(
    (cell) =>
      normalize(cellText(cell)) === normalize(MENU_SHEET_COLUMNS.recipe),
  );
  const numbers =
    column === undefined || column < 0
      ? []
      : sheet.slice(1).map((cells) => cellText(cells[column]));
  const [recipes, sapByNumber] = await Promise.all([
    listRecipeOptions(brand),
    resolveSapCompany(brand.sap_company_name).then((company) =>
      getSapItemsByNumber(numbers, company),
    ),
  ]);
  const { items, errors } = parseMenuSheet(sheet, recipes, sapByNumber);
  if (errors.length > 0) return json({ errors });
  if (items.length === 0) error(400, "The file has no menu items");

  try {
    return json(await importMenu(brand.id, user.id, items));
  } catch (cause) {
    console.error("[recipes/menu/import] failed", cause);
    error(500, "The import failed. Nothing was saved.");
  }
};
