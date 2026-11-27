import { z } from "zod";
import {
  calculateIdealPrice,
  VAT_FACTOR,
} from "$lib/services/offers-data-quality";
// Value import; recipe-import imports only types from here, so no cycle.
import { normalize } from "$lib/services/recipe-import";

/** Shelf (VAT-inclusive) price → ex-VAT net. Only VAT, never the 1.07 buffer. */
export function exVatPrice(shelfPrice: number) {
  return shelfPrice / VAT_FACTOR;
}

/** Brand electricity cost as a share of net sales, from the energy platform. */
export type EnergyCost = {
  /** Percent (2.1 = 2.1%); null when the brand had no sales in the window. */
  percent: number | null;
  from: string;
  to: string;
};

/** Labour € an item carries: its ex-VAT price × the brand labour cost %. */
export function labourCost(shelfPrice: number, labourFraction: number) {
  return exVatPrice(shelfPrice) * labourFraction;
}

/** Prime cost % = (food cost + labour) ÷ ex-VAT price × 100. */
export function primeCostPercent(
  cost: number,
  shelfPrice: number,
  labourFraction: number,
) {
  const food = foodCostPercent(cost, shelfPrice);
  return food === null ? null : food + labourFraction * 100;
}

/**
 * Ideal shelf price for a target margin on the ex-VAT price: FC% = 1 − margin,
 * then the app-wide rule `calculateIdealPrice` (cost ÷ FC% × 1.05 × 1.07).
 * `marginPercent` is 0–100; null when the inputs cannot give a price.
 * `energyFraction` (share of ex-VAT sales) is reserved out of the price too:
 * cost ÷ (1 − margin − energy).
 */
export function idealPriceForMargin(
  cost: number,
  marginPercent: number,
  energyFraction = 0,
) {
  if (
    !Number.isFinite(marginPercent) ||
    marginPercent < 0 ||
    marginPercent >= 100
  ) {
    return null;
  }
  // Round off float noise (1 − 0.98 − 0.02 ≠ 0) so a share that is really 0
  // gives null from calculateIdealPrice instead of an astronomic price.
  const foodShare =
    Math.round((1 - marginPercent / 100 - energyFraction) * 1e9) / 1e9;
  return calculateIdealPrice(cost, foodShare);
}

/** Margin % a shelf price leaves over the cost, on the ex-VAT price. */
export function marginOfPrice(cost: number, shelfPrice: number) {
  if (!(shelfPrice > 0)) return null;
  return (1 - cost / exVatPrice(shelfPrice)) * 100;
}

/** Food cost % = cost ÷ ex-VAT price × 100 (= 100 − margin). */
export function foodCostPercent(cost: number, shelfPrice: number) {
  if (!(shelfPrice > 0)) return null;
  return (cost / exVatPrice(shelfPrice)) * 100;
}

export const PRICE_POINT_ENDINGS = [
  "none",
  ".00",
  ".50",
  ".95",
  ".99",
] as const;
export type PricePointEnding = (typeof PRICE_POINT_ENDINGS)[number];

/**
 * Smallest price ≥ `price` ending in `ending` (cents), so rounding never drops
 * the margin below the target. Works in integer cents to avoid float drift.
 */
export function roundUpToPricePoint(price: number, ending: PricePointEnding) {
  if (ending === "none") return price;
  const target = Number(ending.slice(1));
  const cents = Math.round(price * 100);
  let candidate = Math.floor(cents / 100) * 100 + target;
  if (candidate < cents) candidate += 100;
  return candidate / 100;
}

/** popular / unpopular: rated on sales only, no complete recipe cost. */
export type MenuClass =
  | "star"
  | "plowhorse"
  | "puzzle"
  | "dog"
  | "popular"
  | "unpopular";

/**
 * Kasavana–Smith menu engineering. Popularity is high when an item sells at
 * least 70% of the average units per item; profitability is high when its
 * contribution margin (CM) is at least the sales-weighted average CM.
 */
/**
 * Which active POS items menu engineering rates: only what guests actually
 * choose between, i.e. items with a POS price that sold in the period. Items
 * priced 0 (components, sauces, notes, coupons) and unsold items would pull
 * the popularity bar down and mark too much as popular.
 */
export function menuEngineeringScope<
  T extends { item_code: string; price: number },
>(menu: T[], sales: Map<string, { units: number }>) {
  const rated: T[] = [];
  const unsold: T[] = [];
  let zeroPrice = 0;
  for (const item of menu) {
    if (!(item.price > 0)) zeroPrice += 1;
    else if ((sales.get(item.item_code)?.units ?? 0) > 0) rated.push(item);
    else unsold.push(item);
  }
  return { rated, unsold, zeroPrice };
}

export function menuEngineering(items: { units: number; cm: number | null }[]) {
  const totalUnits = items.reduce((sum, item) => sum + item.units, 0);
  if (items.length === 0 || totalUnits <= 0) {
    return {
      classes: items.map(
        (item): MenuClass => (item.cm === null ? "unpopular" : "dog"),
      ),
      popularityThreshold: 0,
      averageCm: 0,
    };
  }
  // Popularity uses the whole menu mix; margin only the items with a known cost,
  // so uncosted items neither get a quadrant nor skew the average CM.
  const popularityThreshold = (0.7 * totalUnits) / items.length;
  let costedUnits = 0;
  let costedCm = 0;
  for (const item of items) {
    if (item.cm === null) continue;
    costedUnits += item.units;
    costedCm += item.units * item.cm;
  }
  const averageCm = costedUnits > 0 ? costedCm / costedUnits : 0;

  const classes = items.map((item): MenuClass => {
    const popular = item.units >= popularityThreshold;
    if (item.cm === null) return popular ? "popular" : "unpopular";
    const profitable = item.cm >= averageCm;
    if (popular) return profitable ? "star" : "plowhorse";
    return profitable ? "puzzle" : "dog";
  });

  return { classes, popularityThreshold, averageCm };
}

/** A material row from SAP `dbo.sapbw_items` (PK databaseId + item_number). */
export type SapItem = {
  database_id: string;
  companyname: string;
  item_number: string;
  item_description: string;
  inactive: boolean;
  purchasing_uom: string;
  stock_uom: string;
  item_group: string;
  item_sub_category: string;
  /** Moving-average cost per unit; null when SAP has no cost (null or 0). */
  item_cost: number | null;
  last_purchase_price: number | null;
};

export const sapItemSearchSchema = z.object({
  item_number: z.string().trim().max(50).optional(),
  item_description: z.string().trim().max(200).optional(),
  companyname: z.string().trim().max(37).optional(),
  item_group: z.string().trim().max(100).optional(),
  item_sub_category: z.string().trim().max(50).optional(),
  exact: z.boolean().optional(),
});

export type SapItemSearch = z.infer<typeof sapItemSearchSchema>;

export const recipeLineSchema = z.object({
  // Empty = a material the workbook import kept although SAP does not know it.
  database_id: z.string().trim().max(7),
  item_number: z.string().trim().min(1, "Item number is required").max(50),
  quantity: z.number().positive("Quantity must be greater than 0"),
});

export const recipeFormSchema = z.object({
  lines: z.array(recipeLineSchema),
});

export type RecipeForm = z.infer<typeof recipeFormSchema>;

/** Recipe page of a stored recipe, or the builder of a POS item (`new?item=`). */
export function recipeHref(
  brandAlias: string,
  target: { id: number } | { itemCode: string },
) {
  const base = `/admin/recipes/${encodeURIComponent(brandAlias)}`;
  return "id" in target
    ? `${base}/${target.id}`
    : `${base}/new?item=${encodeURIComponent(target.itemCode)}`;
}

/** What a stored line carries beyond the form's three fields. */
export type StoredLine = RecipeForm["lines"][number] & {
  recipe_quantity: number | null;
  saved_description: string;
  saved_uom: string;
};

/**
 * Lines of the recipe form joined to the stored recipe, so a save keeps what
 * the form does not edit. A stored line keeps its description and unit, and
 * its recipe-unit quantity while the purchasing quantity is unchanged (after a
 * change the old figure would be wrong). A line without a SAP company is only
 * accepted when the stored recipe already holds it: a mistyped number must
 * not be saved as a material without cost.
 */
export function mergeStoredLines(
  formLines: RecipeForm["lines"],
  storedLines: StoredLine[],
) {
  const key = (line: { database_id: string; item_number: string }) =>
    `${line.database_id}|${line.item_number}`;
  const stored = new Map(storedLines.map((line) => [key(line), line]));
  const errors: Record<number, string> = {};

  const lines = formLines.map((line, index) => {
    const match = stored.get(key(line));
    if (!line.database_id && !match) {
      errors[index] = `Item ${line.item_number} not found in SAP`;
    }
    return {
      ...line,
      recipe_quantity:
        match && match.quantity === line.quantity
          ? match.recipe_quantity
          : null,
      description: match?.saved_description,
      uom: match?.saved_uom,
    };
  });
  return { lines, errors };
}

export type CostedLine = { quantity: number; unit_cost: number | null };

/**
 * Line cost = quantity (in the item's UoM) × SAP unit cost. A line without a
 * cost contributes nothing and marks the total incomplete, so a partial total
 * is never shown as the real food cost.
 */
export function costRecipe(lines: CostedLine[]) {
  let total = 0;
  let missing = 0;

  for (const line of lines) {
    if (line.unit_cost === null || !Number.isFinite(line.quantity)) {
      missing += 1;
      continue;
    }
    total += line.quantity * line.unit_cost;
  }

  return { total: Math.round(total * 1e6) / 1e6, missing };
}

/** user.meta preference key for the `/admin/recipes` grid's column layout. */
export const RECIPES_COLUMNS_PREFERENCE = "recipes.columns";

/** Column ids of the `/admin/recipes` grid (= row fields they show). */
export const RECIPE_GRID_COLUMN_IDS = [
  "name",
  "status",
  "item_code",
  "pos_name",
  "category",
  "materials",
  "missing",
  "cost",
  "price",
  "cost_percent",
  "updated",
] as const;

/** Saved gp-grid column layout (order, width, pin, hidden) per column. */
export const recipeColumnStateSchema = z
  .array(
    z.object({
      columnId: z.enum(RECIPE_GRID_COLUMN_IDS),
      width: z.number().int().min(40).max(1_000).nullable().optional(),
      order: z.number().int().min(0).max(100),
      pinned: z.enum(["start", "end"]).nullable(),
      hidden: z.boolean().optional(),
    }),
  )
  .max(30);
export type RecipeColumnState = z.infer<typeof recipeColumnStateSchema>;

/** One row of the `/admin/recipes` grid: a stored recipe or a POS item without one. */
export type RecipeRow = {
  /** Grid / export key: `r<recipe id>` or `p<POS item code>`. */
  key: string;
  /** Recipe id; null for a POS item without a recipe. */
  id: number | null;
  name: string;
  item_code: string;
  pos_name: string;
  category: string;
  status: "Linked" | "Unlinked" | "Ambiguous" | "No recipe";
  /** POS item active; recipes without a POS item count as active. */
  active: boolean;
  materials: number;
  missing: number;
  /** Null for a POS item without a recipe. */
  cost: number | null;
  /** POS shelf price; null without a POS item or when POS prices it 0. */
  price: number | null;
  /** Has a POS item, priced 0 there: food cost % cannot be worked out. */
  no_pos_price: boolean;
  updated: string;
};

/**
 * Joins stored recipes to the POS menu. Every recipe gives a row (linked or
 * not); every POS item no recipe is linked to gives a "No recipe" row. A POS
 * price of 0 means "not priced", not free.
 */
export function buildRecipeRows(
  menu: {
    item_code: string;
    description: string;
    category: string;
    price: number;
    active: boolean;
  }[],
  recipes: {
    id: number;
    item_code: string | null;
    name: string;
    lineCount: number;
    total: number;
    missing: number;
    updated_at: Date;
  }[],
): RecipeRow[] {
  const menuByCode = new Map(menu.map((item) => [item.item_code, item]));
  const posItemsByName = new Map<string, number>();
  for (const item of menu) {
    const key = normalize(item.description);
    posItemsByName.set(key, (posItemsByName.get(key) ?? 0) + 1);
  }
  const pricing = (pos: (typeof menu)[number] | null | undefined) => ({
    price: pos && pos.price > 0 ? pos.price : null,
    no_pos_price: !!pos && !(pos.price > 0),
  });

  const rows: RecipeRow[] = recipes.map((recipe) => {
    const pos = recipe.item_code ? menuByCode.get(recipe.item_code) : null;
    return {
      key: `r${recipe.id}`,
      id: recipe.id,
      name: recipe.name,
      item_code: recipe.item_code ?? "",
      pos_name: pos?.description ?? "",
      category: pos?.category ?? "",
      status: recipe.item_code
        ? "Linked"
        : (posItemsByName.get(normalize(recipe.name)) ?? 0) > 1
          ? "Ambiguous"
          : "Unlinked",
      active: pos ? pos.active : true,
      materials: recipe.lineCount,
      missing: recipe.missing,
      cost: recipe.total,
      ...pricing(pos),
      updated: recipe.updated_at.toISOString().slice(0, 10),
    };
  });

  const linked = new Set(recipes.map((recipe) => recipe.item_code));
  for (const item of menu) {
    if (linked.has(item.item_code)) continue;
    rows.push({
      key: `p${item.item_code}`,
      id: null,
      name: item.description,
      item_code: item.item_code,
      pos_name: item.description,
      category: item.category,
      status: "No recipe",
      active: item.active,
      materials: 0,
      missing: 0,
      cost: null,
      ...pricing(item),
      updated: "",
    });
  }
  return rows;
}

export function formatEur(value: number, maximumFractionDigits = 4) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(value);
}
