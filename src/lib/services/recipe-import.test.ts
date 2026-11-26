import { describe, expect, it } from "vitest";
import {
  parseStockSummary,
  planImport,
  type ImportCell,
  type ImportRecipe,
} from "./recipe-import";
import type { SapItem } from "./recipes";

const sap = (item_number: string, uom = "KG", companyname = "PHC_EUR") =>
  ({
    database_id: "PHC_EUR",
    companyname,
    item_number,
    item_description: `Material ${item_number}`,
    inactive: false,
    purchasing_uom: uom,
    stock_uom: uom,
    item_group: "",
    item_sub_category: "",
    item_cost: 1,
    last_purchase_price: null,
  }) satisfies SapItem;

const menu = [
  { item_code: "100", description: "Margherita Large" },
  { item_code: "200", description: "Cola" },
];
const sapByNumber = new Map([
  ["25107", [sap("25107")]],
  ["30000", [sap("30000", "PCS")]],
  ["AB1", [sap("AB1", "KG"), sap("AB1", "KG", "OTHER")]],
]);

describe("parseStockSummary", () => {
  // Shuffled on purpose, with a column the import ignores: read by header name.
  const stockHeader: ImportCell[] = [
    "Stock Item",
    "Recipe ID",
    "Cost per 1 menu item (€)",
    "QTY per 1 menu item (purchasing UoM)",
    "QTY per 1 menu item (recipe unit)",
    "Purchasing UoM",
    "Stock Item Description",
  ];
  const posMenu = [
    ...menu,
    { item_code: "301", description: "Wings 9 pcs" },
    { item_code: "302", description: "Wings 9 pcs" },
  ];
  const parse = (...rows: ImportCell[][]) =>
    parseStockSummary([stockHeader, ...rows], posMenu, sapByNumber);

  it("links by POS name, sums duplicates and keeps both quantities", () => {
    const result = parse(
      [25107, "margherita  LARGE", 9.99, 0.25, 250, "KG", "Sugar"],
      [30000, "margherita  LARGE", 1, 2, 2, "PCS", "Box"],
      [25107, "margherita  LARGE", 1, 0.5, 500, "KG", "Sugar"],
    );
    expect(result.errors).toEqual([]);
    expect(result.recipes).toEqual([
      {
        itemCode: "100",
        importName: "margherita LARGE",
        description: "Margherita Large",
        lines: [
          {
            database_id: "PHC_EUR",
            item_number: "25107",
            quantity: 0.75,
            recipe_quantity: 750,
            description: "Sugar",
            uom: "KG",
          },
          {
            database_id: "PHC_EUR",
            item_number: "30000",
            quantity: 2,
            recipe_quantity: 2,
            description: "Box",
            uom: "PCS",
          },
        ],
      },
    ]);
    expect(result.warnings).toMatchObject([{ row: 4, column: "Stock Item" }]);
  });

  it("keeps unmatched and ambiguous names unlinked, skips case variants", () => {
    const result = parse(
      [25107, "Family Feast Large", 1, 1, 1, "KG", "Sugar"],
      [25107, "Wings 9 pcs", 1, 1, 1, "KG", "Sugar"],
      [25107, "Cola", 1, 1, 1, "KG", "Sugar"],
      [30000, "COLA ", 1, 1, 1, "PCS", "Box"],
      [30000, "Cola", 1, 2, 2, "PCS", "Box"],
    );
    expect(result.recipes.map((r) => [r.importName, r.itemCode])).toEqual([
      ["Family Feast Large", null],
      ["Wings 9 pcs", null],
      ["Cola", "200"],
    ]);
    expect(result.recipes[2].lines.map((l) => l.quantity)).toEqual([1, 2]);
    expect(result.report.map((c) => [c.row, c.status, c.reason])).toEqual([
      [2, "Unlinked", "No POS item with this name"],
      [3, "Unlinked", "Name is shared by 2 POS items"],
      [4, "Linked", "Recipe ID equals the POS item name"],
      [
        5,
        "Skipped",
        'Same Recipe ID as "Cola" (row 4) apart from case or spacing; its rows were skipped',
      ],
    ]);
  });

  it("reports why a name has no POS item and what it resembles", () => {
    const result = parse(
      [25107, "Margherita - Large!", 1, 1, 1, "KG", "Sugar"],
      [25107, "B&T: Cola", 1, 1, 1, "KG", "Sugar"],
      [25107, "Cola Regular", 1, 1, 1, "KG", "Sugar"],
      [25107, "Margherita Extra Large", 1, 1, 1, "KG", "Sugar"],
      [25107, "Zzz", 1, 1, 1, "KG", "Sugar"],
    );
    expect(result.recipes.every((recipe) => recipe.itemCode === null)).toBe(
      true,
    );
    expect(result.report.map((c) => [c.reason, c.posItem])).toEqual([
      [
        "Differs from a POS item name only in symbols or punctuation",
        "Margherita Large (100)",
      ],
      ['Equals a POS item name without the "B&T:" prefix', "Cola (200)"],
      ["Equals a POS item name without the size word", "Cola (200)"],
      ["No POS item with this name", "Closest: Margherita Large (100)"],
      ["No POS item with this name", ""],
    ]);
  });

  it("skips rows without a positive quantity and keeps unknown SAP items", () => {
    const result = parse(
      [25107, "No Strips", 0, 0, 0, "KG", "Sugar"],
      [123456, "Cola", 1, 1, 1, "PCE", "Black Bun"],
      ["AB1", "Cola", 1, "0,5", null, "KG", "Two companies"],
    );
    expect(result.recipes).toEqual([
      {
        itemCode: "200",
        importName: "Cola",
        description: "Cola",
        lines: [
          {
            database_id: "",
            item_number: "123456",
            quantity: 1,
            recipe_quantity: 1,
            description: "Black Bun",
            uom: "PCE",
          },
          {
            database_id: "",
            item_number: "AB1",
            quantity: 0.5,
            recipe_quantity: null,
            description: "Two companies",
            uom: "KG",
          },
        ],
      },
    ]);
    expect(result.warnings.map((w) => `${w.row}:${w.column}`)).toEqual([
      "2:QTY per 1 menu item (purchasing UoM)",
      "3:Stock Item",
      "4:Stock Item",
    ]);
    expect(result.report).toMatchObject([
      { name: "No Strips", status: "Skipped", materials: 0 },
      { name: "Cola", status: "Linked", itemCode: "200", materials: 2 },
    ]);
    expect(result.report[1].notes.split("\n")).toEqual([
      "row 3: SAP item 123456 not found in SAP; kept without cost",
      "row 4: SAP item AB1 exists in several companies; kept without cost",
    ]);
  });

  it("rejects a sheet without the columns or without rows", () => {
    const missing = parseStockSummary(
      [["Recipe ID", "Stock Item"]],
      posMenu,
      sapByNumber,
    );
    expect(missing.errors[0].message).toContain("Purchasing UoM");
    expect(parse().errors[0].message).toBe("The sheet has no recipe rows");
  });
});

describe("planImport", () => {
  const imported = (
    importName: string,
    itemCode: string | null = null,
  ): ImportRecipe => ({
    itemCode,
    importName,
    description: importName,
    lines: [],
  });
  const stored = (
    id: number,
    item_code: string | null,
    import_name: string | null,
    item_description = import_name ?? "",
  ) => ({ id, item_code, import_name, item_description });

  it("updates the same recipe on a re-import and creates new ones", () => {
    const plan = planImport(
      [imported("Fries", "A"), imported("Family Feast")],
      [
        stored(1, "A", "Fries"),
        stored(2, null, "Old Deal"),
        stored(3, "Z", null, "Hand made"),
      ],
    );
    expect(plan.targets).toEqual([1, null]);
    expect(plan.cleanup).toEqual([
      {
        id: 2,
        name: "Old Deal",
        itemCode: "",
        reason: "Imported before, not in this workbook",
      },
    ]);
  });

  it("takes over a hand-built recipe of the same name and flags the duplicate", () => {
    // The real case: hand-built and linked, plus an earlier unlinked import.
    const plan = planImport(
      [imported("Original Recipe 1 Pc")],
      [
        stored(5, "OR1", null, "Original Recipe 1 Pc"),
        stored(402, null, "Original Recipe 1 Pc"),
      ],
    );
    expect(plan.targets).toEqual([5]);
    expect(plan.cleanup).toMatchObject([
      {
        id: 402,
        reason: 'Duplicate of "Original Recipe 1 Pc" in this workbook',
      },
    ]);
  });

  it("prefers the POS item holder and matches names case-insensitively", () => {
    const plan = planImport(
      [imported("Nuggets 14 Pcs", "N14")],
      [
        stored(91, "N14", "Nuggets 14 pcs"),
        stored(259, null, "Nuggets 14 Pcs"),
      ],
    );
    expect(plan.targets).toEqual([91]);
    expect(plan.cleanup.map((row) => row.id)).toEqual([259]);
  });

  it("never gives one stored recipe to two imported ones", () => {
    const plan = planImport(
      [imported("Cola", "C"), imported("Cola Zero", "C0")],
      [stored(7, "C", null, "Cola Zero")],
    );
    expect(plan.targets).toEqual([7, null]);
    expect(plan.cleanup).toEqual([]);
  });
});
