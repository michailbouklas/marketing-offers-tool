import { describe, expect, it } from "vitest";
import {
  buildItemAnalysis,
  buildItemAnalysisMonths,
  parseItemAnalysisParams,
  type ItemAnalysisRow,
} from "./sales-item-analysis";

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

describe("buildItemAnalysisMonths", () => {
  const monthly = (month: string, net: number): ItemAnalysisRow[] => [
    { ...row("grand", "", "", 10, 5, net), month },
    { ...row("category", "Pizzas", "", 10, 5, net), month },
    { ...row("item", "Pizzas", "PIZ", 10, 5, net), month },
  ];

  it("builds one report per month, oldest first, each with its own grand", () => {
    const entries = buildItemAnalysisMonths([
      ...monthly("2026-11-01", 300),
      ...monthly("2026-10-01", 100),
    ]);
    expect(entries.map((entry) => entry.month)).toEqual([
      "2026-10-01",
      "2026-11-01",
    ]);
    expect(entries.map((entry) => entry.report.grand.net)).toEqual([100, 300]);
    expect(entries[1].report.groups[0].items[0].netTot).toBe(1);
  });

  it("gives a single month-less report when not grouped", () => {
    const entries = buildItemAnalysisMonths([
      row("grand", "", "", 10, 5, 50),
      row("category", "Pizzas", "", 10, 5, 50),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].month).toBeNull();
    expect(entries[0].report.grand.net).toBe(50);
  });
});

describe("parseItemAnalysisParams", () => {
  it("keeps repeated known categories (commas included) and reads byMonth", () => {
    const params = new URLSearchParams();
    params.append("category", "Pizzas, Pasta");
    params.append("category", "Pizzas, Pasta");
    params.append("category", "Stale");
    params.set("byMonth", "1");
    expect(
      parseItemAnalysisParams(params, ["Pizzas, Pasta", "Drinks"]),
    ).toEqual({ categories: ["Pizzas, Pasta"], byMonth: true });
  });

  it("defaults to all categories, not grouped", () => {
    expect(parseItemAnalysisParams(new URLSearchParams(), ["Drinks"])).toEqual({
      categories: [],
      byMonth: false,
    });
  });
});
