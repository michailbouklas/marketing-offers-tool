import { z } from "zod";
import {
  calculateIdealPrice,
  IDEAL_PRICE_MARKUP_FACTORS,
} from "$lib/services/offers-data-quality";

/** Shelf (VAT-inclusive) price → ex-VAT, the inverse of the ideal-price factors. */
export function exVatPrice(shelfPrice: number) {
  return IDEAL_PRICE_MARKUP_FACTORS.reduce((price, f) => price / f, shelfPrice);
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

export type MenuClass = "star" | "plowhorse" | "puzzle" | "dog";

/**
 * Kasavana–Smith menu engineering. Popularity is high when an item sells at
 * least 70% of the average units per item; profitability is high when its
 * contribution margin (CM) is at least the sales-weighted average CM.
 */
export function menuEngineering(items: { units: number; cm: number }[]) {
  const totalUnits = items.reduce((sum, item) => sum + item.units, 0);
  if (items.length === 0 || totalUnits <= 0) {
    return {
      classes: items.map((): MenuClass => "dog"),
      popularityThreshold: 0,
      averageCm: 0,
    };
  }
  const popularityThreshold = (0.7 * totalUnits) / items.length;
  const averageCm =
    items.reduce((sum, item) => sum + item.units * item.cm, 0) / totalUnits;

  const classes = items.map((item): MenuClass => {
    const popular = item.units >= popularityThreshold;
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

export function formatEur(value: number, maximumFractionDigits = 4) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(value);
}
