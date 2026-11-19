import { describe, expect, it } from "vitest";
import {
  buildMktReport,
  mktReportSearch,
  parseMktReportParams,
  type MktReportRow,
} from "./mkt-report";

const row = (over: Partial<MktReportRow>): MktReportRow => ({
  aggregator: "wolt",
  store: "A",
  month: "2026-01",
  net: 10,
  vat: 2,
  gross: 12,
  deliveryGross: 0,
  lines: 1,
  invoices: 1,
  salesGross: 120,
  ...over,
});

describe("buildMktReport", () => {
  it("rolls up per store, month and aggregator with % of sales", () => {
    const report = buildMktReport([
      row({}),
      row({ aggregator: "bolt", gross: 30, deliveryGross: 20, salesGross: 0 }),
      row({ store: "B", month: "2026-02", gross: 100, salesGross: 400 }),
    ]);

    expect(report.byStore.map((s) => s.store)).toEqual(["B", "A"]);
    expect(report.byMonth.map((m) => m.month)).toEqual(["2026-01", "2026-02"]);

    const storeA = report.byStore[1];
    expect(storeA.wolt.gross).toBe(12);
    expect(storeA.bolt.gross).toBe(30);
    expect(storeA.total.gross).toBe(42);
    expect(storeA.bolt.pctOfSales).toBeNull(); // no sales → no division by 0
    expect(storeA.total.pctOfSales).toBeCloseTo(35);

    expect(report.total.total.gross).toBe(142);
    expect(report.total.total.deliveryGross).toBe(20);
    expect(report.total.total.invoices).toBe(3);
    expect(report.total.wolt.pctOfSales).toBeCloseTo((112 / 520) * 100);
  });

  it("handles no rows", () => {
    const report = buildMktReport([]);
    expect(report.byStore).toEqual([]);
    expect(report.total.total.pctOfSales).toBeNull();
  });
});

describe("mkt report params", () => {
  it("round-trips and drops invalid values", () => {
    const parsed = parseMktReportParams(
      new URLSearchParams(
        "aggregator=bolt&aggregator=uber&brand=3&brand=x&store=Nicosia, Mall&from=2026-01-01&to=bad&view=table",
      ),
    );
    expect(parsed).toEqual({
      aggregators: ["bolt"],
      brands: [3],
      stores: ["Nicosia, Mall"],
      invoiceNumber: null,
      lineDetails: null,
      from: "2026-01-01",
      to: null,
      view: "table",
    });
    expect(
      parseMktReportParams(new URLSearchParams(mktReportSearch(parsed))),
    ).toEqual(parsed);
  });
});
