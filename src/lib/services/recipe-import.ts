import type { RecipeForm, SapItem } from "$lib/services/recipes";

/** Sheet of the brand cost workbook holding one row per recipe material. */
export const STOCK_SUMMARY_SHEET = "RECIPES-STOCK SUMMARY";

/** Columns read from that sheet, found by header name (any order). */
export const STOCK_SUMMARY_COLUMNS = {
  name: "Recipe ID",
  stock: "Stock Item",
  description: "Stock Item Description",
  uom: "Purchasing UoM",
  recipeQty: "QTY per 1 menu item (recipe unit)",
  quantity: "QTY per 1 menu item (purchasing UoM)",
} as const;

// The KFC workbook is 5.3 MB with 6,991 rows; BODY_SIZE_LIMIT defaults to 20M.
export const MAX_IMPORT_ROWS = 20_000;
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

/** A raw cell as `read-excel-file` returns it. */
export type ImportCell = string | number | boolean | Date | null;

export type ImportError = {
  /** 1-based Excel row number. */
  row: number;
  itemCode: string;
  column: string;
  message: string;
};

export type ImportLine = RecipeForm["lines"][number] & {
  /** Workbook recipe-unit quantity, display only. */
  recipe_quantity?: number | null;
  /** Workbook description / unit, kept when SAP does not know the item. */
  description?: string;
  uom?: string;
};

export type ImportRecipe = {
  /** POS item code; null when the workbook name matches no single POS item. */
  itemCode: string | null;
  /** Workbook `Recipe ID`; unset for the item-code template. */
  importName?: string;
  description: string;
  lines: ImportLine[];
};

/** What the stock-summary import did with one Recipe ID, and why. */
export type ImportCase = {
  name: string;
  /** Excel row where the Recipe ID first appears. */
  row: number;
  status: "Linked" | "Unlinked" | "Skipped";
  reason: string;
  itemCode: string;
  /** The linked POS item, or the POS items that look like this name. */
  posItem: string;
  materials: number;
  /** Row-level remarks ("row 12: …"), one per line. */
  notes: string;
};

export type ImportProgress = {
  done: number;
  total: number;
  current: { itemCode: string | null; description: string } | null;
};

/** `data:` payloads of the import SSE stream. */
export type RecipeImportEvent =
  | { type: "validating" }
  | { type: "invalid"; errors: ImportError[] }
  | ({ type: "progress" } & ImportProgress)
  | {
      type: "done";
      imported: number;
      /** One entry per Recipe ID in the sheet. */
      report: ImportCase[];
      /** Stored duplicates and recipes no longer in the workbook, to review. */
      cleanup: ImportCleanup[];
    }
  | { type: "error"; message: string; imported?: number };

export function cellText(cell: ImportCell | undefined): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim();
}

export const normalize = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

function parseQuantity(cell: ImportCell | undefined): number | null {
  if (typeof cell === "number") return cell;
  const text = cellText(cell).replace(",", ".");
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

type StockSummaryColumn = keyof typeof STOCK_SUMMARY_COLUMNS;

/** Index of each stock-summary column in the header row (-1 = missing). */
function stockSummaryColumns(sheet: ImportCell[][]) {
  const header = (sheet[0] ?? []).map((cell) => normalize(cellText(cell)));
  return Object.fromEntries(
    Object.entries(STOCK_SUMMARY_COLUMNS).map(([key, title]) => [
      key,
      header.indexOf(normalize(title)),
    ]),
  ) as Record<StockSummaryColumn, number>;
}

/** SAP item numbers referenced by a stock-summary sheet. */
export function stockSummaryItemNumbers(sheet: ImportCell[][]): string[] {
  const { stock } = stockSummaryColumns(sheet);
  if (stock < 0) return [];
  return sheet
    .slice(1)
    .map((row) => cellText(row[stock]))
    .filter(Boolean);
}

type PosItem = { item_code: string; description: string };

/** Lower-cased words only: symbols, punctuation and lost characters dropped. */
const looseName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const SIZE_WORD = / (regular|large|medium|small)$/;

/**
 * Why a Recipe ID equals no POS item name, with the POS items it resembles.
 * Report only: none of these near-matches is linked, because a variant or a
 * size would then overwrite the recipe of the plain item.
 */
function explainNoMatch(name: string, menu: PosItem[]) {
  const byLoose = new Map<string, PosItem[]>();
  for (const item of menu) {
    const key = looseName(item.description);
    byLoose.set(key, [...(byLoose.get(key) ?? []), item]);
  }
  const show = (items: PosItem[]) =>
    items.map((item) => `${item.description} (${item.item_code})`).join("; ");

  const loose = looseName(name);
  let found = byLoose.get(loose);
  if (found) {
    return {
      reason: "Differs from a POS item name only in symbols or punctuation",
      posItem: show(found),
    };
  }
  const colon = name.indexOf(":");
  found = colon < 0 ? undefined : byLoose.get(looseName(name.slice(colon + 1)));
  if (found) {
    return {
      reason: `Equals a POS item name without the "${name.slice(0, colon + 1)}" prefix`,
      posItem: show(found),
    };
  }
  found = SIZE_WORD.test(loose)
    ? byLoose.get(loose.replace(SIZE_WORD, ""))
    : undefined;
  if (found) {
    return {
      reason: "Equals a POS item name without the size word",
      posItem: show(found),
    };
  }

  // Closest POS name by shared words; below half shared it is noise.
  const words = new Set(loose.split(" "));
  let best: PosItem | null = null;
  let bestScore = 0;
  for (const [key, items] of byLoose) {
    const other = new Set(key.split(" "));
    let shared = 0;
    for (const word of words) if (other.has(word)) shared += 1;
    const score = shared / (words.size + other.size - shared);
    if (score > bestScore) [best, bestScore] = [items[0], score];
  }
  return {
    reason: "No POS item with this name",
    posItem: best && bestScore >= 0.5 ? `Closest: ${show([best])}` : "",
  };
}

/**
 * Reads the `RECIPES-STOCK SUMMARY` sheet: rows sharing a Recipe ID form one
 * recipe. Unlike the template import this one is lenient, because the workbook
 * is not written for us: only a missing column (or no usable row) is an error.
 * - A Recipe ID equal to exactly one POS description (case and spacing
 *   ignored) links to that item code; otherwise the recipe is kept unlinked.
 * - The purchasing-UoM quantity is the cost basis; rows where it is not above
 *   0 are skipped. The recipe-unit quantity is carried for display.
 * - A stock item SAP does not know (or knows in several companies) is kept
 *   with an empty `database_id`, so it counts as a line without cost.
 * `report` has one entry per Recipe ID, saying what happened to it and why.
 */
export function parseStockSummary(
  sheet: ImportCell[][],
  menu: PosItem[],
  sapByNumber: Map<string, SapItem[]>,
): {
  errors: ImportError[];
  warnings: ImportError[];
  recipes: ImportRecipe[];
  report: ImportCase[];
} {
  const index = stockSummaryColumns(sheet);
  const missing = (Object.keys(index) as StockSummaryColumn[])
    .filter((key) => index[key] < 0)
    .map((key) => STOCK_SUMMARY_COLUMNS[key]);
  const fatal = (message: string) => ({
    errors: [{ row: 1, itemCode: "", column: "", message }],
    warnings: [],
    recipes: [],
    report: [],
  });
  if (missing.length > 0) {
    return fatal(
      `The "${STOCK_SUMMARY_SHEET}" sheet has no column named: ${missing.join(", ")}`,
    );
  }

  const codesByName = new Map<string, string[]>();
  for (const item of menu) {
    const key = normalize(item.description);
    if (key)
      codesByName.set(key, [...(codesByName.get(key) ?? []), item.item_code]);
  }
  const descriptionByCode = new Map(
    menu.map((item) => [item.item_code, item.description]),
  );

  const recipes = new Map<string, ImportRecipe>();
  const warnings: ImportError[] = [];
  const cases = new Map<string, ImportCase>();
  /** First spelling (and its row) of each Recipe ID, case and spacing ignored. */
  const firstSpelling = new Map<string, { name: string; row: number }>();

  sheet.slice(1).forEach((row, rowIndex) => {
    const name = cellText(row[index.name]).replace(/\s+/g, " ");
    const number = cellText(row[index.stock]);
    if (!name && !number) return;
    const warn = (column: StockSummaryColumn, message: string) => {
      warnings.push({
        row: rowIndex + 2,
        itemCode: name,
        column: STOCK_SUMMARY_COLUMNS[column],
        message,
      });
    };

    if (!name) return warn("name", "Recipe ID is empty; row skipped");
    // One recipe per name: a spelling that differs only in case or spacing
    // from an earlier Recipe ID is the same recipe listed twice.
    const first = firstSpelling.get(normalize(name));
    if (first && first.name !== name) {
      if (!cases.has(name)) {
        cases.set(name, {
          name,
          row: rowIndex + 2,
          status: "Skipped",
          reason: `Same Recipe ID as "${first.name}" (row ${first.row}) apart from case or spacing; its rows were skipped`,
          itemCode: "",
          posItem: "",
          materials: 0,
          notes: "",
        });
      }
      return;
    }
    if (!first) firstSpelling.set(normalize(name), { name, row: rowIndex + 2 });
    const entry = cases.get(name) ?? {
      name,
      row: rowIndex + 2,
      status: "Skipped" as const,
      reason: "No row with a stock item and a quantity above 0",
      itemCode: "",
      posItem: "",
      materials: 0,
      notes: "",
    };
    cases.set(name, entry);
    if (!number) return warn("stock", "Stock item is empty; row skipped");
    const quantity = parseQuantity(row[index.quantity]);
    if (quantity === null || !(quantity > 0)) {
      return warn("quantity", "Quantity is not above 0; row skipped");
    }

    let recipe = recipes.get(name);
    if (!recipe) {
      const codes = codesByName.get(normalize(name)) ?? [];
      const itemCode = codes.length === 1 ? codes[0] : null;
      entry.status = "Unlinked";
      if (codes.length > 1) {
        entry.reason = `Name is shared by ${codes.length} POS items`;
        entry.posItem = codes.join("; ");
      } else if (itemCode) {
        entry.status = "Linked";
        entry.reason = "Recipe ID equals the POS item name";
        entry.itemCode = itemCode;
        entry.posItem = descriptionByCode.get(itemCode) ?? "";
      } else {
        Object.assign(entry, explainNoMatch(name, menu));
      }
      recipe = {
        itemCode,
        importName: name,
        description: (itemCode && descriptionByCode.get(itemCode)) || name,
        lines: [],
      };
      recipes.set(name, recipe);
    }

    const matches = sapByNumber.get(number.toUpperCase()) ?? [];
    const sap = matches.length === 1 ? matches[0] : null;
    if (!sap) {
      warn(
        "stock",
        matches.length > 1
          ? `SAP item ${number} exists in several companies; kept without cost`
          : `SAP item ${number} not found in SAP; kept without cost`,
      );
    }
    const database_id = sap?.database_id ?? "";
    const item_number = sap?.item_number ?? number;
    const recipeQuantity = parseQuantity(row[index.recipeQty]);

    const existing = recipe.lines.find(
      (line) =>
        line.database_id === database_id && line.item_number === item_number,
    );
    if (existing) {
      existing.quantity += quantity;
      existing.recipe_quantity =
        (existing.recipe_quantity ?? 0) + (recipeQuantity ?? 0);
      return warn(
        "stock",
        `SAP item ${number} is listed twice for this recipe; quantities added`,
      );
    }
    recipe.lines.push({
      database_id,
      item_number,
      quantity,
      recipe_quantity: recipeQuantity,
      description: cellText(row[index.description]),
      uom: cellText(row[index.uom]),
    });
  });

  if (recipes.size === 0) return fatal("The sheet has no recipe rows");

  for (const entry of cases.values()) {
    entry.materials = recipes.get(entry.name)?.lines.length ?? 0;
  }
  for (const warning of warnings) {
    let entry = cases.get(warning.itemCode);
    if (!entry) {
      entry = {
        name: "(empty Recipe ID)",
        row: warning.row,
        status: "Skipped",
        reason: "Recipe ID is empty",
        itemCode: "",
        posItem: "",
        materials: 0,
        notes: "",
      };
      cases.set(warning.itemCode, entry);
    }
    entry.notes += `${entry.notes ? "\n" : ""}row ${warning.row}: ${warning.message}`;
  }

  return {
    errors: [],
    warnings,
    recipes: [...recipes.values()],
    report: [...cases.values()],
  };
}

/** A stored recipe, as far as matching an import needs it. */
export type StoredRecipe = {
  id: number;
  item_code: string | null;
  import_name: string | null;
  item_description: string;
};

/** A stored recipe the import asks the user to review (and maybe delete). */
export type ImportCleanup = {
  id: number;
  name: string;
  itemCode: string;
  reason: string;
};

/**
 * Decides which stored recipe each imported one updates, so an import never
 * adds a second recipe for the same thing. A stored recipe matches when it
 * has the same name (case and spacing ignored; hand-built recipes by their
 * description) or the same POS item. Among several matches the import takes
 * the one holding its POS item, else a linked one, else the one with the
 * same workbook name; each stored recipe is taken at most once. Matches left
 * over are duplicates; imported recipes not taken at all are no longer in the
 * workbook. Both are returned for the user to review, never deleted here.
 */
export function planImport(recipes: ImportRecipe[], stored: StoredRecipe[]) {
  const key = (name: string) => normalize(name);
  const claimed = new Map<number, ImportRecipe>();
  const matches = new Map<number, ImportRecipe>();

  const targets = recipes.map((recipe) => {
    const name = key(recipe.importName ?? recipe.description);
    const rank = (row: StoredRecipe) =>
      recipe.itemCode !== null && row.item_code === recipe.itemCode
        ? 0
        : row.item_code !== null
          ? 1
          : row.import_name === recipe.importName
            ? 2
            : 3;
    const candidates = stored
      .filter(
        (row) =>
          (recipe.itemCode !== null && row.item_code === recipe.itemCode) ||
          key(row.import_name ?? row.item_description) === name,
      )
      .toSorted((a, b) => rank(a) - rank(b) || a.id - b.id);
    for (const row of candidates)
      if (!matches.has(row.id)) matches.set(row.id, recipe);
    const target = candidates.find((row) => !claimed.has(row.id)) ?? null;
    if (target) claimed.set(target.id, recipe);
    return target?.id ?? null;
  });

  const cleanup: ImportCleanup[] = [];
  for (const row of stored) {
    if (claimed.has(row.id)) continue;
    const match = matches.get(row.id);
    if (!match && row.import_name === null) continue; // hand-built, unrelated
    cleanup.push({
      id: row.id,
      name: row.import_name ?? row.item_description,
      itemCode: row.item_code ?? "",
      reason: match
        ? `Duplicate of "${match.importName ?? match.description}" in this workbook`
        : "Imported before, not in this workbook",
    });
  }
  return { targets, cleanup };
}
