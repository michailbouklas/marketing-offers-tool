import { describe, expect, it } from "vitest";
import {
  costRecipe,
  foodCostPercent,
  menuEngineering,
  roundUpToPricePoint,
  idealPriceForMargin,
  marginOfPrice,
  labourCost,
  primeCostPercent,
  recipeFormSchema,
  comboRange,
  costCombo,
  withComboCosts,
} from "./recipes";

describe("foodCostPercent", () => {
  it("is cost over the ex-VAT price and complements the margin", () => {
    // 10.50 shelf = 10.00 ex 5% VAT
    expect(foodCostPercent(3, 10.5)).toBeCloseTo(30, 6);
    expect(foodCostPercent(3, 11.24)! + marginOfPrice(3, 11.24)!).toBeCloseTo(
      100,
      9,
    );
    expect(foodCostPercent(3, 0)).toBeNull();
  });
});

describe("labour", () => {
  it("costs labour on the ex-VAT price and adds it to food cost for prime cost", () => {
    expect(labourCost(10.5, 0.25)).toBeCloseTo(2.5, 9);
    expect(primeCostPercent(3, 10.5, 0.25)).toBeCloseTo(55, 9);
    expect(primeCostPercent(3, 0, 0.25)).toBeNull();
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

  it("rates uncosted items on popularity only, outside the average CM", () => {
    // total 400 units, 4 items → threshold 70; avg CM over costed only = 1060/230
    const result = menuEngineering([
      { units: 200, cm: 5 },
      { units: 150, cm: null }, // popular, no cost
      { units: 30, cm: 2 },
      { units: 20, cm: null }, // unpopular, no cost
    ]);
    expect(result.popularityThreshold).toBe(70);
    expect(result.averageCm).toBeCloseTo(1060 / 230, 9);
    expect(result.classes).toEqual(["star", "popular", "dog", "unpopular"]);
  });
});

describe("ideal price", () => {
  it("matches the data-quality rule: €3.00 at 70% margin → €11.24 shelf", () => {
    expect(idealPriceForMargin(3, 70)).toBe(11.24);
  });

  it("keeps the 1.07 buffer as headroom: FC % at the ideal price = target ÷ 1.07", () => {
    expect(foodCostPercent(3, 11.235)).toBeCloseTo(30 / 1.07, 6);
    expect(marginOfPrice(3, 11.235)).toBeCloseTo(100 - 30 / 1.07, 6);
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

describe("combo costs", () => {
  const costs = new Map([
    ["BURGER", { total: 1.2, missing: 0 }],
    ["FRIES", { total: 0.4, missing: 0 }],
    ["COLA", { total: 0.3, missing: 0 }],
    ["JUICE", { total: 0.5, missing: 0 }],
    ["SAUCE", { total: 0.1, missing: 1 }],
  ]);
  const meal = [
    { item_code: "BURGER", name: "Burger", perCombo: 1, qty: 0, net: 0 },
    { item_code: "FRIES", name: "Fries", perCombo: 1, qty: 0, net: 0 },
    // 70% pick cola, 30% juice: the drink cost is weighted by choice.
    { item_code: "COLA", name: "Cola", perCombo: 0.7, qty: 0, net: 0 },
    { item_code: "JUICE", name: "Juice", perCombo: 0.3, qty: 0, net: 0 },
  ];

  it("weights each component by its average quantity per combo", () => {
    expect(costCombo(meal, costs)).toEqual({
      total: 1.2 + 0.4 + 0.21 + 0.15,
      missing: 0,
      missingCodes: [],
    });
  });

  it("flags components without a complete recipe", () => {
    const result = costCombo(
      [
        ...meal,
        { item_code: "SAUCE", name: "", perCombo: 1, qty: 0, net: 0 },
        { item_code: "ICE", name: "", perCombo: 1, qty: 0, net: 0 },
      ],
      costs,
    );
    expect(result.missing).toBe(2);
    expect(result.missingCodes).toEqual(["SAUCE", "ICE"]);
  });

  it("keeps an item's own recipe over the combo cost", () => {
    const merged = withComboCosts(
      new Map([...costs, ["MEAL1", { total: 9, missing: 0 }]]),
      new Map([
        ["MEAL1", meal],
        ["MEAL2", meal],
      ]),
    );
    expect(merged.get("MEAL1")).toMatchObject({ total: 9, source: "recipe" });
    expect(merged.get("MEAL2")).toMatchObject({
      total: 1.96,
      missing: 0,
      source: "combo",
      componentCount: 4,
    });
    expect(merged.get("FRIES")?.source).toBe("recipe");
  });
});

describe("comboRange", () => {
  const now = new Date("2026-11-05T10:00:00Z");

  it("defaults to the last 90 days", () => {
    expect(comboRange(new URLSearchParams(), now)).toEqual({
      from: "2026-08-07",
      to: "2026-11-05",
    });
  });

  it("uses a valid URL range and swaps reversed ends", () => {
    expect(
      comboRange(new URLSearchParams("from=2026-10-31&to=2026-10-01"), now),
    ).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(
      comboRange(new URLSearchParams("from=nope&to=2026-10-01"), now),
    ).toMatchObject({ to: "2026-11-05" });
  });
});
