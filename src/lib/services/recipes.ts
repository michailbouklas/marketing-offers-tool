import { z } from "zod";
import {
  calculateIdealPrice,
  VAT_FACTOR,
} from "$lib/services/offers-data-quality";
import { parseOfferDateRange } from "$lib/services/sales-offers";

/** Shelf (VAT-inclusive) price → ex-VAT net. Only VAT, never the 1.07 buffer. */
export function exVatPrice(shelfPrice: number) {
  return shelfPrice / VAT_FACTOR;
}

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
 */
export function idealPriceForMargin(cost: number, marginPercent: number) {
  if (
    !Number.isFinite(marginPercent) ||
    marginPercent < 0 ||
    marginPercent >= 100
  ) {
    return null;
  }
  return calculateIdealPrice(cost, 1 - marginPercent / 100);
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
  database_id: z.string().trim().min(1).max(7),
  item_number: z.string().trim().min(1, "Item number is required").max(50),
  quantity: z.number().positive("Quantity must be greater than 0"),
});

export const recipeFormSchema = z.object({
  lines: z.array(recipeLineSchema),
});

export type RecipeForm = z.infer<typeof recipeFormSchema>;

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

/** Default sales window for recognising combos and averaging components. */
export const COMBO_WINDOW_DAYS = 90;

export type ComboRange = { from: string; to: string };

/** `from`/`to` from the URL (both valid ISO days), else the last 90 days. */
export function comboRange(
  params: URLSearchParams,
  now = new Date(),
): ComboRange {
  const parsed = parseOfferDateRange(params);
  if (parsed) return parsed;
  const day = (offset: number) =>
    new Date(now.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
  return { from: day(COMBO_WINDOW_DAYS), to: day(0) };
}

/** A component of a POS combo, from sales: average quantity per combo sold. */
export type ComboComponent = {
  item_code: string;
  name: string;
  perCombo: number;
  /** Units that went out with the combo in the range. */
  qty: number;
  /** Net charged on these lines (paid extras or a split of the combo price). */
  net: number;
};

type ItemCost = { total: number; missing: number };

/**
 * Expected material cost of one combo: Σ component cost × average quantity
 * per combo. A component without a complete recipe is missing, so the total
 * is flagged incomplete like a recipe line without a SAP cost.
 */
export function costCombo(
  components: ComboComponent[],
  costs: Map<string, ItemCost>,
) {
  let total = 0;
  const missingCodes: string[] = [];
  for (const component of components) {
    const cost = costs.get(component.item_code);
    if (!cost || cost.missing > 0) {
      missingCodes.push(component.item_code);
      continue;
    }
    total += cost.total * component.perCombo;
  }
  return {
    total: Math.round(total * 1e6) / 1e6,
    missing: missingCodes.length,
    missingCodes,
  };
}

/** `costCombo` plus each component's own recipe cost, for display. */
export function costComboDetail(
  components: ComboComponent[],
  costs: Map<string, ItemCost>,
) {
  return {
    ...costCombo(components, costs),
    components: components.map((component) => {
      const cost = costs.get(component.item_code);
      const unitCost = cost && cost.missing === 0 ? cost.total : null;
      return {
        ...component,
        hasRecipe: Boolean(cost),
        unitCost,
        lineCost: unitCost === null ? null : unitCost * component.perCombo,
      };
    }),
  };
}

export type ComboDetail = ReturnType<typeof costComboDetail>;

/**
 * Adds a cost for every combo without its own recipe, derived from its
 * components' recipes. An item's own recipe always wins.
 */
export function withComboCosts<T extends ItemCost>(
  costs: Map<string, T>,
  combos: Map<string, ComboComponent[]>,
) {
  const merged = new Map<
    string,
    | (T & { source: "recipe" })
    | (ItemCost & { source: "combo"; componentCount: number })
  >();
  for (const [code, cost] of costs)
    merged.set(code, { ...cost, source: "recipe" });
  for (const [code, components] of combos) {
    if (merged.has(code)) continue;
    const { total, missing } = costCombo(components, costs);
    merged.set(code, {
      total,
      missing,
      source: "combo",
      componentCount: components.length,
    });
  }
  return merged;
}

export function formatEur(value: number, maximumFractionDigits = 4) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(value);
}
