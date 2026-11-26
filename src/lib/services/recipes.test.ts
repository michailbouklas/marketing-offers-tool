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
  buildRecipeRows,
  mergeStoredLines,
  recipeHref,
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

  it("reserves the energy share out of the price: €3.00 at 70% + 2.1% energy", () => {
    // 3 ÷ (0.30 − 0.021) × 1.05 × 1.07 = 12.0807…
    expect(idealPriceForMargin(3, 70, 0.021)).toBe(12.08);
    expect(idealPriceForMargin(3, 70, 0)).toBe(idealPriceForMargin(3, 70));
  });

  it("gives no price when margin + energy leave nothing for food", () => {
    expect(idealPriceForMargin(3, 98, 0.02)).toBeNull();
    expect(idealPriceForMargin(3, 98, 0.03)).toBeNull();
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

describe("recipeHref", () => {
  it("points at the recipe id, or at the builder of a POS item", () => {
    expect(recipeHref("kfc", { id: 12 })).toBe("/admin/recipes/kfc/12");
    expect(recipeHref("b k", { itemCode: "A/1 &2" })).toBe(
      "/admin/recipes/b%20k/new?item=A%2F1%20%262",
    );
  });
});

describe("mergeStoredLines", () => {
  const stored = [
    {
      database_id: "PHC_EUR",
      item_number: "25107",
      quantity: 0.25,
      recipe_quantity: 250,
      saved_description: "Sugar",
      saved_uom: "KG",
    },
    {
      database_id: "",
      item_number: "123456",
      quantity: 1,
      recipe_quantity: 1,
      saved_description: "Black Bun",
      saved_uom: "PCE",
    },
  ];

  it("keeps what the form does not edit", () => {
    const result = mergeStoredLines(
      [
        { database_id: "PHC_EUR", item_number: "25107", quantity: 0.25 },
        { database_id: "", item_number: "123456", quantity: 1 },
      ],
      stored,
    );
    expect(result.errors).toEqual({});
    expect(result.lines).toEqual([
      {
        database_id: "PHC_EUR",
        item_number: "25107",
        quantity: 0.25,
        recipe_quantity: 250,
        description: "Sugar",
        uom: "KG",
      },
      {
        database_id: "",
        item_number: "123456",
        quantity: 1,
        recipe_quantity: 1,
        description: "Black Bun",
        uom: "PCE",
      },
    ]);
  });

  it("clears the recipe quantity of a line whose quantity changed", () => {
    const { lines } = mergeStoredLines(
      [{ database_id: "PHC_EUR", item_number: "25107", quantity: 0.3 }],
      stored,
    );
    expect(lines[0]).toMatchObject({ recipe_quantity: null, uom: "KG" });
  });

  it("rejects a new line without a SAP company, accepts a new SAP line", () => {
    const result = mergeStoredLines(
      [
        { database_id: "", item_number: "999", quantity: 1 },
        { database_id: "PHC_EUR", item_number: "30000", quantity: 2 },
      ],
      stored,
    );
    expect(result.errors).toEqual({ 0: "Item 999 not found in SAP" });
    expect(result.lines[1]).toMatchObject({
      recipe_quantity: null,
      description: undefined,
    });
  });
});

describe("buildRecipeRows", () => {
  const menu = [
    {
      item_code: "A",
      description: "Fries",
      category: "Sides",
      price: 2,
      active: true,
    },
    {
      item_code: "B",
      description: "Wings",
      category: "Chicken",
      price: 0,
      active: true,
    },
    {
      item_code: "C",
      description: "Wings",
      category: "Chicken",
      price: 5,
      active: false,
    },
    {
      item_code: "D",
      description: "Cola",
      category: "Drinks",
      price: 1.5,
      active: true,
    },
  ];
  const at = new Date("2026-11-26T10:00:00Z");
  const recipe = (id: number, item_code: string | null, name: string) => ({
    id,
    item_code,
    name,
    lineCount: 2,
    total: 0.5,
    missing: 0,
    updated_at: at,
  });

  it("gives one row per recipe and per POS item without one", () => {
    const rows = buildRecipeRows(menu, [
      recipe(1, "A", "Fries"),
      recipe(2, "B", "Wings 0 price"),
      recipe(3, null, "Wings"),
      recipe(4, null, "Family Feast"),
    ]);
    expect(
      rows.map((row) => [row.key, row.status, row.price, row.no_pos_price]),
    ).toEqual([
      ["r1", "Linked", 2, false],
      ["r2", "Linked", null, true],
      ["r3", "Ambiguous", null, false],
      ["r4", "Unlinked", null, false],
      ["pC", "No recipe", 5, false],
      ["pD", "No recipe", 1.5, false],
    ]);
    expect(rows[4]).toMatchObject({ id: null, cost: null, active: false });
    expect(rows[0]).toMatchObject({ updated: "2026-11-26", active: true });
  });
});
