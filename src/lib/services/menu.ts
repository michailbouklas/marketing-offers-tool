import { z } from "zod";
import { IDEAL_PRICE_MARKUP_FACTORS } from "$lib/services/offers-data-quality";
import {
  cellText,
  normalize,
  type ImportCell,
  type ImportError,
} from "$lib/services/recipe-import";
import type { SapItem } from "$lib/services/recipes";

/** Import / template columns, found by header name (any order). */
export const MENU_SHEET_COLUMNS = {
  name: "Menu item",
  category: "Category",
  type: "Type",
  meal: "Meal",
  size: "Size",
  status: "Status",
  price: "Price",
  /** Template only (calculated from Price); ignored on import. */
  net: "Net selling price",
  recipe: "Recipe or material",
  quantity: "Quantity",
} as const;

export const MAX_MENU_IMPORT_ROWS = 20_000;
export const MAX_MENU_IMPORT_BYTES = 10 * 1024 * 1024;

export const MENU_SIZES = ["in", "small", "normal", "large", "XL"] as const;
export type MenuSize = (typeof MENU_SIZES)[number];

/**
 * Net selling price = shelf price ÷ 1.05 VAT ÷ 1.07 service, the workbook rule
 * (11.90 → 10.59). Display only: food cost % stays on the ex-VAT price.
 */
export function netSellingPrice(price: number | null) {
  if (price === null) return null;
  const net = IDEAL_PRICE_MARKUP_FACTORS.reduce(
    (value, factor) => value / factor,
    price,
  );
  return Math.round(net * 100) / 100;
}

/** A recipe line, or a raw SAP material line (quantity in its purchasing UoM). */
export const menuItemLineSchema = z
  .object({
    recipeId: z.number().int().positive().nullable(),
    database_id: z.string().trim().max(7).nullable(),
    item_number: z.string().trim().max(50).nullable(),
    quantity: z.number().positive("Must be above 0").max(9_999),
  })
  .refine(
    (line) => (line.recipeId === null) !== (line.item_number === null),
    "A line is either a recipe or a material",
  );
export type MenuItemLine = z.infer<typeof menuItemLineSchema>;

export const menuItemFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    category: z.string().trim().max(100).default(""),
    /** Limited-time offer; false = regular menu item. */
    lto: z.boolean().default(false),
    meal: z.boolean().default(false),
    size: z.enum(MENU_SIZES).nullable().default(null),
    active: z.boolean().default(true),
    /** Shelf price, VAT included; null = not priced yet. */
    price: z.number().min(0).max(99_999).nullable().default(null),
    lines: z
      .array(menuItemLineSchema)
      .min(1, "Add at least one recipe or material")
      .max(100),
  })
  .refine((item) => !item.meal || item.size !== null, {
    message: "Pick the meal size",
    path: ["size"],
  });
export type MenuItemForm = z.infer<typeof menuItemFormSchema>;

export const menuBulkSchema = z.object({
  action: z.enum(["activate", "disable", "delete"]),
  ids: z.array(z.number().int().positive()).min(1).max(5_000),
});

/** What the menu needs to know about a brand recipe. */
export type RecipeOption = {
  id: number;
  name: string;
  item_code: string;
  category: string;
  /** Live SAP cost of 1 unit of the recipe. */
  cost: number;
  /** SAP materials without a cost: the cost understates the real one. */
  missing: number;
  /** POS shelf price; null without a priced POS item. */
  price: number | null;
};

/** What the builder shows for a SAP material line (a SapItem subset). */
export type MaterialInfo = Pick<
  SapItem,
  "item_number" | "item_description" | "purchasing_uom" | "item_cost"
>;

export const sapKey = (line: { database_id: string; item_number: string }) =>
  `${line.database_id}|${line.item_number}`;

/**
 * Cost of a bundle of recipes and SAP materials. Incomplete when a recipe is
 * gone or has materials without a SAP cost, or a material has no SAP cost.
 * `partsPrice` = what the recipes sell for alone; materials (packaging, extra
 * cheese…) are never sold alone and do not count. Null once a recipe has no
 * POS price.
 */
export function menuItemCost(
  lines: {
    recipeId: number | null;
    database_id?: string | null;
    item_number?: string | null;
    quantity: number;
  }[],
  recipes: Map<number, RecipeOption>,
  materials: Map<string, { item_cost: number | null }> = new Map(),
) {
  let cost = 0;
  let partsPrice: number | null = 0;
  let complete = true;
  for (const line of lines) {
    if (line.item_number) {
      const unit = materials.get(
        sapKey({
          database_id: line.database_id ?? "",
          item_number: line.item_number,
        }),
      )?.item_cost;
      if (unit == null) complete = false;
      else cost += unit * line.quantity;
      continue;
    }
    const recipe = line.recipeId === null ? null : recipes.get(line.recipeId);
    if (!recipe) {
      complete = false;
      partsPrice = null;
      continue;
    }
    cost += recipe.cost * line.quantity;
    if (recipe.missing > 0) complete = false;
    partsPrice =
      partsPrice === null || recipe.price === null
        ? null
        : partsPrice + recipe.price * line.quantity;
  }
  return {
    cost: Math.round(cost * 1e6) / 1e6,
    complete,
    partsPrice: partsPrice === null ? null : Math.round(partsPrice * 100) / 100,
  };
}

/** Discount the menu price gives vs the parts sold alone, as a fraction. */
export function impliedDiscount(
  price: number | null,
  partsPrice: number | null,
) {
  if (price === null || partsPrice === null || !(partsPrice > 0)) return null;
  return 1 - price / partsPrice;
}

/** One row of the menu table. */
export type MenuItemRow = {
  id: number;
  name: string;
  category: string;
  lto: boolean;
  meal: boolean;
  size: string | null;
  active: boolean;
  price: number | null;
  /** Line names with quantities, e.g. "Zinger Burger, 2 × Fries". */
  contents: string;
  cost: number;
  complete: boolean;
  parts_price: number | null;
  updated: string;
};

export type MenuImportLine = {
  recipeId: number | null;
  database_id: string | null;
  item_number: string | null;
  name: string;
  uom: string;
  quantity: number;
};

export type MenuImportItem = {
  name: string;
  category: string;
  lto: boolean;
  meal: boolean;
  size: MenuSize | null;
  /** Undefined = blank Status: active when new, unchanged when it exists. */
  active: boolean | undefined;
  price: number | null;
  lines: MenuImportLine[];
};

export type MenuImportResult = { created: number; updated: number };

const YES_NO: [string, boolean][] = [
  ["", false],
  ["no", false],
  ["n", false],
  ["false", false],
  ["0", false],
  ["yes", true],
  ["y", true],
  ["true", true],
  ["1", true],
];
/** Type column: Menu Item / LTO (also the workbook's values and Yes/No). */
const LTO_VALUES = new Map<string, boolean>([
  ...YES_NO,
  ["menu item", false],
  ["lto", true],
  ["limited time offer", true],
]);
const MEAL_VALUES = new Map<string, boolean>(YES_NO);
const SIZE_VALUES = new Map<string, MenuSize>(
  MENU_SIZES.map((size) => [size.toLowerCase(), size]),
);
const STATUS_VALUES = new Map([
  ["active", true],
  ["enabled", true],
  ["disabled", false],
  ["inactive", false],
]);

function parseNumber(cell: ImportCell | undefined): number | null {
  if (typeof cell === "number") return cell;
  const text = cellText(cell).replace(",", ".");
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : Number.NaN;
}

/**
 * Reads the menu sheet: one row per recipe or material of a menu item; a
 * blank "Menu item" continues the item above (like the cost workbook). Item
 * columns come from the item's first row. "Recipe or material" is a recipe
 * name, a recipe's POS code, or a SAP item number (`sapByNumber`, keyed
 * upper-case as `getSapItemsByNumber` returns it).
 */
export function parseMenuSheet(
  sheet: ImportCell[][],
  recipes: { id: number; name: string; item_code: string }[],
  sapByNumber: Map<string, SapItem[]> = new Map(),
): { items: MenuImportItem[]; errors: ImportError[] } {
  const errors: ImportError[] = [];
  const header = (sheet[0] ?? []).map((cell) => normalize(cellText(cell)));
  const col = Object.fromEntries(
    Object.entries(MENU_SHEET_COLUMNS).map(([key, title]) => [
      key,
      header.indexOf(normalize(title)),
    ]),
  ) as Record<keyof typeof MENU_SHEET_COLUMNS, number>;
  const missingColumns = (["name", "recipe"] as const).filter(
    (key) => col[key] < 0,
  );
  if (missingColumns.length > 0) {
    return {
      items: [],
      errors: missingColumns.map((key) => ({
        row: 1,
        itemCode: "",
        column: MENU_SHEET_COLUMNS[key],
        message: "Column not found in the header row",
      })),
    };
  }

  const byName = new Map<string, { id: number; name: string }[]>();
  const byCode = new Map<string, { id: number; name: string }>();
  for (const recipe of recipes) {
    const key = normalize(recipe.name);
    byName.set(key, [...(byName.get(key) ?? []), recipe]);
    if (recipe.item_code) byCode.set(recipe.item_code, recipe);
  }

  const items: MenuImportItem[] = [];
  const seen = new Set<string>();
  let current: MenuImportItem | null = null;

  for (const [index, cells] of sheet.slice(1).entries()) {
    const row = index + 2;
    const get = (key: keyof typeof MENU_SHEET_COLUMNS) =>
      col[key] < 0 ? undefined : cells[col[key]];
    if (cells.every((cell) => cellText(cell) === "")) continue;

    const name = cellText(get("name")).replace(/\s+/g, " ");
    const fail = (column: string, message: string) =>
      errors.push({
        row,
        itemCode: name || current?.name || "",
        column,
        message,
      });

    if (name) {
      if (name.length > 200) fail("Menu item", "Longer than 200 characters");
      if (seen.has(normalize(name))) {
        fail(
          "Menu item",
          "Appears twice: keep its rows together under one name",
        );
      }
      seen.add(normalize(name));

      const lto = LTO_VALUES.get(normalize(cellText(get("type"))));
      if (lto === undefined) fail("Type", "Use Menu Item or LTO");
      const meal = MEAL_VALUES.get(normalize(cellText(get("meal"))));
      if (meal === undefined) fail("Meal", "Use Yes or No");
      const sizeText = normalize(cellText(get("size")));
      const size = sizeText ? SIZE_VALUES.get(sizeText) : undefined;
      if (sizeText && !size) {
        fail("Size", `Use one of ${MENU_SIZES.join(", ")}`);
      } else if (meal && !size) {
        fail("Size", "A meal needs a size");
      } else if (meal === false && size) {
        fail("Size", "Only meals have a size: set Meal to Yes");
      }
      const statusText = normalize(cellText(get("status")));
      const active = statusText ? STATUS_VALUES.get(statusText) : undefined;
      if (statusText && active === undefined) {
        fail("Status", "Use Active or Disabled (or leave blank)");
      }
      const price = parseNumber(get("price"));
      if (price !== null && !(price >= 0 && price < 100_000)) {
        fail("Price", "Not a price");
      }
      current = {
        name,
        category: cellText(get("category")).slice(0, 100),
        lto: lto ?? false,
        meal: meal ?? false,
        size: meal ? (size ?? null) : null,
        active,
        price: price === null || Number.isNaN(price) ? null : price,
        lines: [],
      };
      items.push(current);
    } else if (!current) {
      fail("Menu item", "No menu item above this row");
      continue;
    }

    const column = MENU_SHEET_COLUMNS.recipe;
    const text = cellText(get("recipe"));
    const quantity = parseNumber(get("quantity")) ?? 1;
    if (!(quantity > 0 && quantity < 10_000)) {
      fail("Quantity", "Must be a number above 0");
    }
    if (!text) {
      fail(column, "Missing");
      continue;
    }

    // A recipe name first, then a recipe's POS code, then a SAP item number.
    const named = byName.get(normalize(text)) ?? [];
    const recipe = named.length === 1 ? named[0] : byCode.get(text);
    if (!recipe && named.length > 1) {
      fail(
        column,
        `"${text}" matches ${named.length} recipes: use its POS code`,
      );
      continue;
    }
    if (recipe) {
      current.lines.push({
        recipeId: recipe.id,
        database_id: null,
        item_number: null,
        name: recipe.name,
        uom: "",
        quantity,
      });
      continue;
    }

    const materials = sapByNumber.get(text.toUpperCase()) ?? [];
    if (materials.length !== 1) {
      fail(
        column,
        materials.length === 0
          ? `"${text}" is neither a recipe of this brand nor a SAP item number`
          : `SAP item ${text} exists in ${materials.length} companies: set the brand's SAP company`,
      );
      continue;
    }
    const [material] = materials;
    current.lines.push({
      recipeId: null,
      database_id: material.database_id,
      item_number: material.item_number,
      name: material.item_description,
      uom: material.purchasing_uom,
      quantity,
    });
  }

  return { items, errors };
}
