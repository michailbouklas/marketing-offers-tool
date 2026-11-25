import { describe, expect, it } from "vitest";
import { buildChartSpec } from "./generate-chart";

const input = (overrides: Record<string, unknown> = {}) => ({
  chartType: "bar" as const,
  title: "Net sales by brand",
  xKey: "brand name",
  series: [
    { key: "net sales", label: "Net" },
    { key: "orders", label: "Orders" },
  ],
  rows: [
    { "brand name": "A", "net sales": 10.5, orders: "3" },
    { "brand name": "B", "net sales": 20, orders: 4 },
  ],
  ...overrides,
});

describe("buildChartSpec", () => {
  it("normalises rows to x + positional numeric series keys", () => {
    expect(buildChartSpec(input())).toEqual({
      ok: true,
      chartType: "bar",
      title: "Net sales by brand",
      xLabel: "brand name",
      series: [
        { key: "s0", label: "Net" },
        { key: "s1", label: "Orders" },
      ],
      rows: [
        { x: "A", s0: 10.5, s1: 3 },
        { x: "B", s0: 20, s1: 4 },
      ],
    });
  });

  it("rejects a missing or non-numeric series value, naming the row", () => {
    const result = buildChartSpec(
      input({
        rows: [
          { "brand name": "A", "net sales": 1, orders: 1 },
          { "brand name": "B", "net sales": null, orders: 1 },
        ],
      }),
    );
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toContain("Row 2");
    expect(
      buildChartSpec(input({ rows: [{ "brand name": "A", orders: "n/a" }] }))
        .ok,
    ).toBe(false);
  });

  it("rejects a row without an x value", () => {
    expect(
      buildChartSpec(input({ rows: [{ "net sales": 1, orders: 1 }] })).ok,
    ).toBe(false);
  });

  it("pie needs one series and positive values", () => {
    expect(buildChartSpec(input({ chartType: "pie" })).ok).toBe(false);
    const single = {
      chartType: "pie",
      series: [{ key: "orders", label: "O" }],
    };
    expect(buildChartSpec(input(single)).ok).toBe(true);
    expect(
      buildChartSpec(
        input({ ...single, rows: [{ "brand name": "A", orders: 0 }] }),
      ).ok,
    ).toBe(false);
  });
});
