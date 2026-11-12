import { describe, expect, it } from "vitest";
import {
  buildConsolidatedReport,
  consolidatedSearch,
  parseConsolidatedExtras,
  type ConsolidatedRow,
} from "./sales-consolidated";

const row = (over: Partial<ConsolidatedRow>): ConsolidatedRow => ({
  company: "DAFERA",
  companyLabel: "DAFERA LTD",
  store: "S1",
  location: "A",
  city: "NICOSIA",
  trans: 0,
  gross: 0,
  discount: 0,
  net: 0,
  ...over,
});

describe("parseConsolidatedExtras", () => {
  it("dedupes lists and keeps only weekdays 1-7, sorted", () => {
    expect(
      parseConsolidatedExtras(
        new URLSearchParams(
          "stores=S1,S1, S2&cities=NICOSIA&weekdays=7,1,0,8,x,1.5,1",
        ),
      ),
    ).toEqual({ stores: ["S1", "S2"], cities: ["NICOSIA"], weekdays: [1, 7] });
  });

  it("round-trips through consolidatedSearch", () => {
    const extras = { stores: ["S1"], cities: [], weekdays: [1, 3] };
    const search = consolidatedSearch(
      { brands: ["bk"], from: "2026-01-01", to: "2026-01-31", channels: [] },
      extras,
      false,
    );
    expect(search).toBe(
      "brands=bk&from=2026-01-01&to=2026-01-31&stores=S1&weekdays=1%2C3",
    );
    expect(parseConsolidatedExtras(new URLSearchParams(search))).toEqual(
      extras,
    );
  });
});

describe("buildConsolidatedReport", () => {
  it("groups by company with subtotals, grand total and averages", () => {
    const report = buildConsolidatedReport([
      row({
        store: "S2",
        location: "B",
        trans: 2,
        gross: 30,
        discount: 2,
        net: 28,
      }),
      row({
        store: "S1",
        location: "A",
        trans: 1,
        gross: 10,
        discount: 0,
        net: 10,
      }),
      row({
        company: "PHC",
        companyLabel: "PHC LTD",
        store: "S3",
        location: "C",
        trans: 0,
        gross: 0,
        discount: 0,
        net: 0,
      }),
    ]);

    expect(report.groups.map((group) => group.label)).toEqual([
      "DAFERA LTD",
      "PHC LTD",
    ]);
    expect(report.groups[0].rows.map((line) => line.location)).toEqual([
      "A",
      "B",
    ]);
    expect(report.groups[0].rows[1].avgGross).toBe(15);
    expect(report.groups[0].total).toEqual({
      trans: 3,
      gross: 40,
      discount: 2,
      net: 38,
      avgGross: 40 / 3,
      avgNet: 38 / 3,
    });
    expect(report.groups[1].total.avgNet).toBeNull();
    expect(report.total.trans).toBe(3);
    expect(report.total.net).toBe(38);
  });
});
