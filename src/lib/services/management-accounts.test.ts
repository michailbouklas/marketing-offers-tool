import { describe, expect, it } from "vitest";
import {
  buildMarketingCostTable,
  formatAccounting,
  marketingCostCsv,
  marketingCostYears,
  monthlyMatrix,
  summariseBreakdown,
  type AccountBreakdownRow,
  parseMonth,
  type MarketingCostRow,
} from "./management-accounts";

const row = (
  level4Name: string,
  level5Code: string,
  year: number,
  value: number,
): MarketingCostRow => ({
  level4Code: level4Name.slice(0, 3),
  level4Name,
  level5Code,
  level5Name: `Account ${level5Code}`,
  year,
  value,
});

describe("buildMarketingCostTable", () => {
  it("pivots accounts × years into name-sorted groups with totals", () => {
    const table = buildMarketingCostTable(
      [
        row("Promotions", "61010800", 2024, -100),
        row("Promotions", "61010800", 2025, -50),
        row("Agency Fees", "61011100", 2025, -20),
        row("Agency Fees", "61011101", 2025, -5),
        row("Agency Fees", "61011100", 2025, -1),
        row("Agency Fees", "61011100", 2019, -999), // outside the years: ignored
      ],
      [2024, 2025],
    );

    expect(table.total).toEqual([-100, -76]);
    expect(table.groups.map((group) => group.name)).toEqual([
      "Agency Fees",
      "Promotions",
    ]);
    expect(table.groups[0].values).toEqual([0, -26]);
    expect(table.groups[0].accounts).toEqual([
      { code: "61011100", name: "Account 61011100", values: [0, -21] },
      { code: "61011101", name: "Account 61011101", values: [0, -5] },
    ]);
  });
});

describe("formatAccounting", () => {
  it("brackets negatives and dashes zero like Power BI", () => {
    expect(formatAccounting(-4205443.4)).toBe("(4,205,443)");
    expect(formatAccounting(1234.6)).toBe("1,235");
    expect(formatAccounting(0.4)).toBe("-");
  });
});

describe("marketingCostYears", () => {
  it("is the current year and the three before it", () => {
    expect(marketingCostYears(new Date(2026, 10, 6))).toEqual([
      2023, 2024, 2025, 2026,
    ]);
  });
});

describe("parseMonth", () => {
  it("accepts 1–12 and treats anything else as all months", () => {
    expect(parseMonth("3")).toBe(3);
    expect(parseMonth("12")).toBe(12);
    for (const bad of [null, "", "0", "13", "1.5", "abc", " "]) {
      expect(parseMonth(bad)).toBeNull();
    }
  });
});

describe("marketingCostCsv", () => {
  it("keeps the given order, skips unknown codes and neutralises formulas", () => {
    const table = buildMarketingCostTable(
      [
        row("Agency, Fees", "100", 2025, -1234.567),
        { ...row("TV", "200", 2025, -5), level5Name: '=HYPERLINK("x")' },
      ],
      [2025],
    );
    expect(marketingCostCsv(table, ["200", "nope", "100"])).toBe(
      "Group,Account code,Account,2025\r\n" +
        'TV,200," =HYPERLINK(""x"")",-5\r\n' +
        '"Agency, Fees",100,Account 100,-1234.57\r\n',
    );
  });
});

describe("summariseBreakdown", () => {
  const row = (
    company: string,
    supplier: string,
    value: number,
  ): AccountBreakdownRow => ({
    company,
    brand: "B",
    store: "S",
    type: "APInvoice",
    supplier,
    value,
    lines: 1,
  });
  const rows = [
    row("A", "Wolt", -100),
    row("A", "", -50),
    row("B", "Bolt", -300),
    row("C", "Wolt", 20),
  ];

  it("groups, sorts by spend and keeps the total", () => {
    const items = summariseBreakdown(rows, "company");
    expect(items.map((item) => [item.label, item.value, item.lines])).toEqual([
      ["B", -300, 1],
      ["A", -150, 2],
      ["C", 20, 1],
    ]);
    const total = items.reduce((sum, item) => sum + item.value, 0);
    expect(total).toBe(-430);
    expect(items[0].share).toBeCloseTo(300 / 430);
  });

  it("folds the tail into Other and labels blanks", () => {
    const items = summariseBreakdown(rows, "supplier", 1);
    expect(items.map((item) => [item.label, item.value])).toEqual([
      ["Bolt", -300],
      ["Other (2)", -130],
    ]);
    expect(
      summariseBreakdown(rows, "supplier").map((item) => item.label),
    ).toContain("(none)");
  });

  it("handles no rows and a zero total", () => {
    expect(summariseBreakdown([], "brand")).toEqual([]);
    const items = summariseBreakdown(
      [row("A", "", 5), row("B", "", -5)],
      "company",
    );
    expect(items.every((item) => item.share === 0)).toBe(true);
  });
});

describe("monthlyMatrix", () => {
  it("places values by year and month and ignores unknown years", () => {
    expect(
      monthlyMatrix(
        [
          { year: 2025, month: 1, value: -10 },
          { year: 2025, month: 1, value: -5 },
          { year: 2026, month: 12, value: 3 },
          { year: 2019, month: 4, value: 99 },
        ],
        [2025, 2026],
      ),
    ).toEqual([
      [-15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3],
    ]);
  });
});
