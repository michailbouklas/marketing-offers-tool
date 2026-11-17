import { describe, expect, it } from "vitest";
import { buildItemAnalysis, type ItemAnalysisRow } from "./sales-item-analysis";

const row = (
  level: ItemAnalysisRow["level"],
  category: string,
  code: string,
  qty: number,
  trans: number,
  net: number,
): ItemAnalysisRow => ({ level, category, code, name: code, qty, trans, net });

describe("buildItemAnalysis", () => {
  const report = buildItemAnalysis([
    row("grand", "", "", 200, 100, 1000),
    row("category", "Drinks", "", 50, 40, 100),
    row("item", "Drinks", "COLA", 30, 25, 60),
    row("item", "Drinks", "AQUA", 20, 20, 40),
    row("category", "Pizzas", "", 150, 80, 900),
    row("item", "Pizzas", "PIZ", 150, 80, 900),
  ]);

  it("orders categories by net and items by code", () => {
    expect(report.groups.map((group) => group.category)).toEqual([
      "Pizzas",
      "Drinks",
    ]);
    expect(report.groups[1].items.map((item) => item.code)).toEqual([
      "AQUA",
      "COLA",
    ]);
  });

  it("computes Grp %, Tot % and Qty/Tr against the distinct totals", () => {
    const cola = report.groups[1].items[1];
    expect(cola.qtyGrp).toBeCloseTo(30 / 50);
    expect(cola.qtyTot).toBeCloseTo(30 / 200);
    expect(cola.qtyPerTrans).toBeCloseTo(30 / 100);
    // Group trans is the distinct 40, not 25 + 20.
    expect(cola.transGrp).toBeCloseTo(25 / 40);
    expect(cola.transTot).toBeCloseTo(25 / 100);
    expect(cola.netGrp).toBeCloseTo(60 / 100);
    expect(cola.netTot).toBeCloseTo(60 / 1000);
    expect(report.groups[1].total.transTot).toBeCloseTo(40 / 100);
  });

  it("returns zeros on an empty selection", () => {
    expect(buildItemAnalysis([])).toEqual({
      groups: [],
      grand: { qty: 0, trans: 0, net: 0 },
    });
  });
});
