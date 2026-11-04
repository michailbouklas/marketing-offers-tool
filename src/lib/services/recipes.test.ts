import { describe, expect, it } from "vitest";
import {
  costRecipe,
  foodCostPercent,
  menuEngineering,
  roundUpToPricePoint,
  idealPriceForMargin,
  marginOfPrice,
  recipeFormSchema,
} from "./recipes";

describe("foodCostPercent", () => {
  it("is cost over the ex-VAT price and complements the margin", () => {
    expect(foodCostPercent(3, 11.235)).toBeCloseTo(30, 6);
    expect(foodCostPercent(3, 11.24)! + marginOfPrice(3, 11.24)!).toBeCloseTo(
      100,
      9,
    );
    expect(foodCostPercent(3, 0)).toBeNull();
  });
});

describe("roundUpToPricePoint", () => {
  it("rounds up to the chosen ending", () => {
    expect(roundUpToPricePoint(9.47, ".50")).toBe(9.5);
    expect(roundUpToPricePoint(9.47, ".95")).toBe(9.95);
    expect(roundUpToPricePoint(9.47, ".99")).toBe(9.99);
    expect(roundUpToPricePoint(9.47, ".00")).toBe(10);
    expect(roundUpToPricePoint(9.47, "none")).toBe(9.47);
  });

  it("keeps a price that already has the ending and never rounds down", () => {
    expect(roundUpToPricePoint(9.99, ".99")).toBe(9.99);
    expect(roundUpToPricePoint(9.96, ".95")).toBe(10.95);
    expect(roundUpToPricePoint(10, ".00")).toBe(10);
  });
});

describe("menuEngineering", () => {
  it("classifies by 70% popularity rule and weighted average CM", () => {
    // total 400 units, 4 items → popularity threshold 70; avg CM = 1500/400 = 3.75
    const result = menuEngineering([
      { units: 200, cm: 5 }, // popular, high CM
      { units: 150, cm: 2 }, // popular, low CM
      { units: 30, cm: 6 }, // unpopular, high CM
      { units: 20, cm: 1 }, // unpopular, low CM
    ]);
    expect(result.popularityThreshold).toBe(70);
    expect(result.averageCm).toBeCloseTo(3.75, 9);
    expect(result.classes).toEqual(["star", "plowhorse", "puzzle", "dog"]);
  });

  it("handles an empty list or no sales", () => {
    expect(menuEngineering([]).classes).toEqual([]);
    expect(menuEngineering([{ units: 0, cm: 2 }]).classes).toEqual(["dog"]);
  });
});

describe("ideal price", () => {
  it("matches the data-quality rule: €3.00 at 70% margin → €11.24 shelf", () => {
    expect(idealPriceForMargin(3, 70)).toBe(11.24);
  });

  it("round-trips: the margin of the ideal price is the target", () => {
    expect(marginOfPrice(3, 11.24)).toBeCloseTo(70, 1);
  });

  it("rejects margins outside 0–<100 and non-positive prices", () => {
    expect(idealPriceForMargin(3, 100)).toBeNull();
    expect(idealPriceForMargin(3, -1)).toBeNull();
    expect(idealPriceForMargin(3, Number.NaN)).toBeNull();
    expect(marginOfPrice(3, 0)).toBeNull();
  });
});

describe("costRecipe", () => {
  it("sums quantity × unit cost (sugar 0.02 KG at 0.8425/KG)", () => {
    expect(
      costRecipe([
        { quantity: 0.02, unit_cost: 0.8425 },
        { quantity: 2, unit_cost: 1.5 },
      ]),
    ).toEqual({ total: 3.01685, missing: 0 });
  });

  it("counts lines without a cost instead of treating them as free", () => {
    expect(
      costRecipe([
        { quantity: 1, unit_cost: null },
        { quantity: 1, unit_cost: 2 },
      ]),
    ).toEqual({ total: 2, missing: 1 });
  });

  it("is zero for an empty recipe", () => {
    expect(costRecipe([])).toEqual({ total: 0, missing: 0 });
  });
});

describe("recipeFormSchema", () => {
  it("rejects non-positive quantities and blank item numbers", () => {
    const result = recipeFormSchema.safeParse({
      lines: [{ database_id: "PHC_EUR", item_number: " ", quantity: 0 }],
    });
    expect(result.success).toBe(false);
  });
});
