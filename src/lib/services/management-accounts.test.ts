import { describe, expect, it } from "vitest";
import {
  buildMarketingCostTable,
  formatAccounting,
  marketingCostCsv,
  marketingCostYears,
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
