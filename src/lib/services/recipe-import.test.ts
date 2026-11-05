import { describe, expect, it } from "vitest";
import {
  RECIPE_IMPORT_COLUMNS,
  validateImportRows,
  type ImportCell,
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
const header: ImportCell[] = [...RECIPE_IMPORT_COLUMNS];

const run = (...rows: ImportCell[][]) =>
  validateImportRows([header, ...rows], menu, sapByNumber);

describe("validateImportRows", () => {
  it("groups rows by item code in row order", () => {
    const result = run(
      ["100", "margherita  large", "25107", "kg", 0.25],
      [200, "Cola", 30000, "PCS", "1,5"],
      ["100", "Margherita Large", "30000", "PCS", 2],
      [null, null, null, null, null],
    );
    expect(result.errors).toEqual([]);
    expect(result.recipes).toEqual([
      {
        itemCode: "100",
        description: "Margherita Large",
        lines: [
          { database_id: "PHC_EUR", item_number: "25107", quantity: 0.25 },
          { database_id: "PHC_EUR", item_number: "30000", quantity: 2 },
        ],
      },
      {
        itemCode: "200",
        description: "Cola",
        lines: [
          { database_id: "PHC_EUR", item_number: "30000", quantity: 1.5 },
        ],
      },
    ]);
  });

  it("collects every problem with its row and column", () => {
    const result = run(
      ["999", "Nope", "25107", "KG", 1],
      ["100", "Pepperoni", "25107", "PCS", 0],
      ["100", "Margherita Large", "404", "KG", "abc"],
      ["100", "Margherita Large", "ab1", "KG", 1],
    );
    expect(result.recipes).toEqual([]);
    expect(result.errors.map((e) => `${e.row}:${e.column}`)).toEqual([
      "2:Item code",
      "3:Item name",
      "3:Unit",
      "3:Quantity",
      "4:SAP item number",
      "4:Quantity",
      "5:SAP item number",
    ]);
    expect(result.errors[6].message).toContain("several companies");
  });

  it("rejects a duplicate SAP item in one recipe", () => {
    const result = run(
      ["100", "Margherita Large", "25107", "KG", 1],
      ["100", "Margherita Large", "25107", "KG", 2],
    );
    expect(result.errors).toMatchObject([
      { row: 3, column: "SAP item number" },
    ]);
  });

  it("rejects a wrong header and an empty file", () => {
    expect(
      validateImportRows([["Code", "Name"]], menu, sapByNumber).errors[0].row,
    ).toBe(1);
    expect(run().errors[0].message).toBe("The file has no recipe rows");
  });
});
