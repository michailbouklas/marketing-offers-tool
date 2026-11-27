import { describe, expect, it } from "vitest";
import {
  impliedDiscount,
  menuItemCost,
  menuItemFormSchema,
  netSellingPrice,
  parseMenuSheet,
  type RecipeOption,
} from "./menu";
import type { ImportCell } from "./recipe-import";
import type { SapItem } from "./recipes";

const recipe = (
  id: number,
  name: string,
  cost: number,
  price: number | null,
  missing = 0,
): RecipeOption => ({
  id,
  name,
  item_code: `P${id}`,
  category: "",
  cost,
  missing,
  price,
});

const sap = (item_number: string, item_cost: number | null = 2) =>
  ({
    database_id: "PHC_EUR",
    companyname: "PHC_EUR",
    item_number,
    item_description: `Material ${item_number}`,
    inactive: false,
    purchasing_uom: "KG",
    stock_uom: "KG",
    item_group: "",
    item_sub_category: "",
    item_cost,
    last_purchase_price: null,
  }) satisfies SapItem;

const recipes = [
  recipe(1, "Zinger Burger", 1.2, 5),
  recipe(2, "French Fries Large", 0.4, 2.5),
  recipe(3, "Pepsi 33cl", 0.3, null),
];
const header = [
  "Menu item",
  "Category",
  "Type",
  "Meal",
  "Size",
  "Status",
  "Price",
  "Net selling price",
  "Recipe or material",
  "Quantity",
];
/** A row in header order; omitted trailing cells are blank. */
const row = (...cells: ImportCell[]) => cells;

describe("netSellingPrice", () => {
  it("is price ÷ 1.05 ÷ 1.07, like the workbook", () => {
    expect(netSellingPrice(11.9)).toBe(10.59);
    expect(netSellingPrice(2.5)).toBe(2.23);
    expect(netSellingPrice(null)).toBeNull();
  });
});

describe("menuItemCost", () => {
  const byId = new Map(recipes.map((r) => [r.id, r]));

  it("adds cost and parts price by quantity", () => {
    expect(
      menuItemCost(
        [
          { recipeId: 1, quantity: 1 },
          { recipeId: 2, quantity: 2 },
        ],
        byId,
      ),
    ).toEqual({ cost: 2, complete: true, partsPrice: 10 });
  });

  it("costs materials by SAP unit cost and leaves them out of the parts price", () => {
    const materials = new Map([["PHC_EUR|27730", { item_cost: 4 }]]);
    expect(
      menuItemCost(
        [
          { recipeId: 1, quantity: 1 },
          {
            recipeId: null,
            database_id: "PHC_EUR",
            item_number: "27730",
            quantity: 0.05,
          },
        ],
        byId,
        materials,
      ),
    ).toEqual({ cost: 1.4, complete: true, partsPrice: 5 });
  });

  it("is incomplete for a material without cost, a deleted or partial recipe", () => {
    const material = {
      recipeId: null,
      database_id: "PHC_EUR",
      item_number: "1",
      quantity: 1,
    };
    expect(menuItemCost([material], byId).complete).toBe(false);
    expect(menuItemCost([{ recipeId: null, quantity: 1 }], byId).complete).toBe(
      false,
    );
    const partial = new Map([[9, recipe(9, "X", 1, 2, 1)]]);
    expect(menuItemCost([{ recipeId: 9, quantity: 1 }], partial).complete).toBe(
      false,
    );
  });

  it("has no parts price when one recipe has no POS price", () => {
    expect(
      menuItemCost(
        [
          { recipeId: 1, quantity: 1 },
          { recipeId: 3, quantity: 1 },
        ],
        byId,
      ).partsPrice,
    ).toBeNull();
  });

  it("implied discount is vs the parts price", () => {
    expect(impliedDiscount(7.5, 10)).toBeCloseTo(0.25);
    expect(impliedDiscount(null, 10)).toBeNull();
    expect(impliedDiscount(5, null)).toBeNull();
  });
});

describe("menuItemFormSchema", () => {
  const base = {
    name: "A",
    lines: [{ recipeId: 1, database_id: null, item_number: null, quantity: 1 }],
  };
  it("needs a size for a meal", () => {
    expect(menuItemFormSchema.safeParse({ ...base, meal: true }).success).toBe(
      false,
    );
    expect(
      menuItemFormSchema.safeParse({ ...base, meal: true, size: "XL" }).success,
    ).toBe(true);
  });
  it("a line is a recipe or a material, not both", () => {
    const both = {
      ...base,
      lines: [{ recipeId: 1, database_id: "X", item_number: "1", quantity: 1 }],
    };
    expect(menuItemFormSchema.safeParse(both).success).toBe(false);
  });
});

describe("parseMenuSheet", () => {
  it("groups continuation rows and reads item columns from the first row", () => {
    const sheet: ImportCell[][] = [
      header,
      row(
        "Zinger Meal",
        "Burger Meal",
        "LTO",
        "Yes",
        "large",
        "Disabled",
        7.9,
        6.9,
        "Zinger Burger",
        1,
      ),
      row(
        null,
        "ignored",
        "Menu Item",
        "No",
        null,
        null,
        99,
        null,
        "french fries  large",
        2,
      ),
      row(null, null, null, null, null, null, null, null, 27730, 0.05),
      row("Fries", null, "Menu Item", null, null, null, "", null, "P2", null),
    ];
    const { items, errors } = parseMenuSheet(
      sheet,
      recipes,
      new Map([["27730", [sap("27730")]]]),
    );
    expect(errors).toEqual([]);
    expect(items).toEqual([
      {
        name: "Zinger Meal",
        category: "Burger Meal",
        lto: true,
        meal: true,
        size: "large",
        active: false,
        price: 7.9,
        lines: [
          {
            recipeId: 1,
            database_id: null,
            item_number: null,
            name: "Zinger Burger",
            uom: "",
            quantity: 1,
          },
          {
            recipeId: 2,
            database_id: null,
            item_number: null,
            name: "French Fries Large",
            uom: "",
            quantity: 2,
          },
          {
            recipeId: null,
            database_id: "PHC_EUR",
            item_number: "27730",
            name: "Material 27730",
            uom: "KG",
            quantity: 0.05,
          },
        ],
      },
      {
        name: "Fries",
        category: "",
        lto: false,
        meal: false,
        size: null,
        active: undefined,
        price: null,
        lines: [
          {
            recipeId: 2,
            database_id: null,
            item_number: null,
            name: "French Fries Large",
            uom: "",
            quantity: 1,
          },
        ],
      },
    ]);
  });

  it("accepts the workbook's MENU ITEM / LTO values and size case-insensitively", () => {
    const { items, errors } = parseMenuSheet(
      [
        header,
        row("A", "", "LTO", "", "", "", 1, "", "P1", 1),
        row("B", "", "MENU ITEM", "yes", "xl", "", 1, "", "P1", 1),
      ],
      recipes,
    );
    expect(errors).toEqual([]);
    expect(items.map((item) => [item.lto, item.size])).toEqual([
      [true, null],
      [false, "XL"],
    ]);
  });

  it("reports every row problem", () => {
    const { errors } = parseMenuSheet(
      [
        header,
        row(null, "", "", "", "", "", "", "", "P1", 1),
        row("A", "", "maybe", "perhaps", "huge", "on", "abc", "", "Nope", 0),
        row("B", "", "", "Yes", "", "", "", "", "P1", 1),
        row("C", "", "", "No", "small", "", "", "", "P1", 1),
        row("a", "", "", "", "", "", "", "", "P1", 1),
      ],
      recipes,
      new Map([["NOPE", [sap("Nope"), sap("Nope")]]]),
    );
    expect(errors.map((e) => `${e.row} ${e.column}`)).toEqual([
      "2 Menu item",
      "3 Type",
      "3 Meal",
      "3 Size",
      "3 Status",
      "3 Price",
      "3 Quantity",
      "3 Recipe or material",
      "4 Size",
      "5 Size",
      "6 Menu item",
    ]);
    expect(errors[7].message).toMatch(/exists in 2 companies/);
  });

  it("reports text that is neither a recipe nor a SAP item", () => {
    const { errors } = parseMenuSheet(
      [header, row("A", "", "", "", "", "", "", "", "99999", 1)],
      recipes,
    );
    expect(errors[0].message).toMatch(/neither a recipe/);
  });

  it("flags ambiguous recipe names", () => {
    const { errors } = parseMenuSheet(
      [header, row("A", "", "", "", "", "", "", "", "Dup", 1)],
      [recipe(5, "Dup", 1, 1), recipe(6, "dup", 1, 1)],
    );
    expect(errors[0].message).toMatch(/matches 2 recipes/);
  });

  it("needs the Menu item and Recipe or material columns", () => {
    const { errors } = parseMenuSheet([["Name", "Qty"]], recipes);
    expect(errors.map((e) => e.column)).toEqual([
      "Menu item",
      "Recipe or material",
    ]);
  });
});
