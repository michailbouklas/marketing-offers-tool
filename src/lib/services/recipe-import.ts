import type { RecipeForm, SapItem } from "$lib/services/recipes";

/** Template header, in order. The first sheet of the upload must start with it. */
export const RECIPE_IMPORT_COLUMNS = [
  "Item code",
  "Item name",
  "SAP item number",
  "Unit",
  "Quantity",
] as const;

export const MAX_IMPORT_ROWS = 5_000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** A raw cell as `read-excel-file` returns it. */
export type ImportCell = string | number | boolean | Date | null;

export type ImportError = {
  /** 1-based Excel row number. */
  row: number;
  itemCode: string;
  column: string;
  message: string;
};

export type ImportRecipe = {
  itemCode: string;
  description: string;
  lines: RecipeForm["lines"];
};

export type ImportProgress = {
  done: number;
  total: number;
  current: { itemCode: string; description: string } | null;
};

/** `data:` payloads of the import SSE stream. */
export type RecipeImportEvent =
  | { type: "validating" }
  | { type: "invalid"; errors: ImportError[] }
  | ({ type: "progress" } & ImportProgress)
  | { type: "done"; imported: number }
  | { type: "error"; message: string; imported?: number };

export function cellText(cell: ImportCell | undefined): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim();
}

const normalize = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

function parseQuantity(cell: ImportCell | undefined): number | null {
  if (typeof cell === "number") return cell;
  const text = cellText(cell).replace(",", ".");
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** SAP item numbers referenced by the data rows (header skipped). */
export function importItemNumbers(sheet: ImportCell[][]): string[] {
  return sheet
    .slice(1)
    .map((row) => cellText(row[2]))
    .filter(Boolean);
}

/**
 * Checks every row and collects every problem; recipes are only returned when
 * there are none. Rows sharing an item code form one recipe, in row order.
 * `sapByNumber` holds the SAP rows for each upper-cased item number (more than
 * one = the number exists in several companies and cannot be resolved).
 */
export function validateImportRows(
  sheet: ImportCell[][],
  menu: { item_code: string; description: string }[],
  sapByNumber: Map<string, SapItem[]>,
): { errors: ImportError[]; recipes: ImportRecipe[] } {
  const header = (sheet[0] ?? []).map(cellText);
  const headerOk = RECIPE_IMPORT_COLUMNS.every(
    (column, index) => normalize(header[index] ?? "") === normalize(column),
  );
  if (!headerOk) {
    return {
      errors: [
        {
          row: 1,
          itemCode: "",
          column: "",
          message: `The first row must be the template header: ${RECIPE_IMPORT_COLUMNS.join(", ")}. Download the template and copy your rows into it.`,
        },
      ],
      recipes: [],
    };
  }

  const menuByCode = new Map(menu.map((item) => [item.item_code, item]));
  const recipes = new Map<string, ImportRecipe>();
  const errors: ImportError[] = [];

  sheet.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    if (row.every((cell) => cellText(cell) === "")) return;

    const [code, name, number, unit] = row.slice(0, 4).map(cellText);
    const quantity = parseQuantity(row[4]);
    const fail = (column: string, message: string) =>
      errors.push({ row: rowNumber, itemCode: code, column, message });

    const menuItem = menuByCode.get(code);
    if (!code) fail("Item code", "Item code is empty");
    else if (!menuItem)
      fail("Item code", `Item code ${code} is not on the menu`);

    if (!name) fail("Item name", "Item name is empty");
    else if (menuItem && normalize(name) !== normalize(menuItem.description)) {
      fail(
        "Item name",
        `"${name}" does not match the menu name "${menuItem.description}"`,
      );
    }

    const matches = number ? (sapByNumber.get(number.toUpperCase()) ?? []) : [];
    const sap = matches.length === 1 ? matches[0] : null;
    if (!number) fail("SAP item number", "SAP item number is empty");
    else if (matches.length === 0) {
      fail("SAP item number", `SAP item ${number} not found`);
    } else if (!sap) {
      fail(
        "SAP item number",
        `SAP item ${number} exists in several companies (${matches.map((m) => m.companyname).join(", ")})`,
      );
    }

    if (!unit) fail("Unit", "Unit is empty");
    else if (sap && normalize(unit) !== normalize(sap.purchasing_uom)) {
      fail(
        "Unit",
        `Unit "${unit}" does not match SAP unit "${sap.purchasing_uom || "(none)"}"`,
      );
    }

    if (!cellText(row[4])) fail("Quantity", "Quantity is empty");
    else if (quantity === null) fail("Quantity", "Quantity must be a number");
    else if (!(quantity > 0))
      fail("Quantity", "Quantity must be greater than 0");

    if (!menuItem || !sap || quantity === null) return;
    const recipe = recipes.get(code) ?? {
      itemCode: code,
      description: menuItem.description,
      lines: [],
    };
    recipes.set(code, recipe);
    if (
      recipe.lines.some(
        (line) =>
          line.database_id === sap.database_id &&
          line.item_number === sap.item_number,
      )
    ) {
      fail("SAP item number", `SAP item ${number} is listed twice for ${code}`);
      return;
    }
    recipe.lines.push({
      database_id: sap.database_id,
      item_number: sap.item_number,
      quantity,
    });
  });

  if (errors.length === 0 && recipes.size === 0) {
    errors.push({
      row: 2,
      itemCode: "",
      column: "",
      message: "The file has no recipe rows",
    });
  }

  return { errors, recipes: errors.length ? [] : [...recipes.values()] };
}
