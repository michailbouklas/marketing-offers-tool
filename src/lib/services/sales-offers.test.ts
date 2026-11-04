import { describe, expect, it } from "vitest";
import {
  compareWinner,
  offerCompareMetrics,
  offerReason,
  parseOfferDateRange,
  unitFoodCost,
  valueOffer,
  weekdayMix,
  weeklyCurve,
  type OfferDailyRow,
  type OfferValueRow,
} from "./sales-offers";

const row: OfferValueRow = {
  code: "7414290",
  name: "King Combo",
  channel: "All Channels",
  category: "BundleDisc",
  fcPerc: 0.5,
  fcEur: null,
  sellingPrice: 11.235,
  firstSale: "2026-01-01",
  lastSale: "2026-11-02",
  daysOnSale: 300,
  units: 100,
  orders: 100,
  offerNet: 1000,
  addonNet: 200,
};

describe("unitFoodCost", () => {
  it("takes fc_perc of the ex-VAT selling price", () => {
    expect(unitFoodCost(row)).toBeCloseTo(5);
  });
  it("prefers fc_eur", () => {
    expect(unitFoodCost({ ...row, fcEur: 3 })).toBe(3);
  });
  it("is null without cost data", () => {
    expect(unitFoodCost({ ...row, fcPerc: null })).toBeNull();
    expect(unitFoodCost({ ...row, fcPerc: 0 })).toBeNull();
    expect(unitFoodCost({ ...row, sellingPrice: 0 })).toBeNull();
  });
});

describe("valueOffer", () => {
  it("costs the basket at the brand FC % and flags below target", () => {
    // 1000 − 500 + 200 × 0.7 = 640 over 1200 revenue = 53 % < 70 %
    const value = valueOffer(row, 0.3);
    expect(value.foodCost).toBeCloseTo(500);
    expect(value.contribution).toBeCloseTo(640);
    expect(value.marginPct).toBeCloseTo(640 / 1200);
    expect(value.verdict).toBe("below_target");
  });
  it("is positive at or above the brand margin", () => {
    expect(valueOffer({ ...row, fcPerc: 0.1 }, 0.3).verdict).toBe("positive");
  });
  it("is a loss when food cost eats the revenue", () => {
    expect(
      valueOffer({ ...row, offerNet: 100, addonNet: 0 }, 0.3).verdict,
    ).toBe("loss");
  });
  it("needs cost data and a brand target", () => {
    expect(valueOffer({ ...row, fcPerc: null }, 0.3).verdict).toBe("no_cost");
    expect(valueOffer(row, null).verdict).toBe("no_target");
  });
});

describe("offerReason", () => {
  it("explains below target with own margin, basket lift and target", () => {
    const text = offerReason(valueOffer(row, 0.3), 0.3);
    expect(text).toContain("keeps 50% of its sales after food cost");
    expect(text).toContain("move it to 53%");
    expect(text).toContain("target is 70%");
  });
  it("states the loss amount", () => {
    const loss = valueOffer({ ...row, offerNet: 100, addonNet: 0 }, 0.3);
    expect(offerReason(loss, 0.3)).toMatch(/lost €400\.00 overall/);
  });
  it("says positive offers meet the target", () => {
    const text = offerReason(valueOffer({ ...row, fcPerc: 0.1 }, 0.3), 0.3);
    expect(text).toContain("meets the brand target of 70%");
  });
  it("points at the missing data", () => {
    expect(
      offerReason(valueOffer({ ...row, fcPerc: null }, 0.3), 0.3),
    ).toContain("Offers data quality");
    expect(offerReason(valueOffer(row, null), null)).toContain("ideal FC %");
  });
});

describe("offerCompareMetrics", () => {
  const metric = (label: string, a: OfferValueRow, b: OfferValueRow) =>
    offerCompareMetrics(valueOffer(a, 0.3), valueOffer(b, 0.3)).find(
      (m) => m.label === label,
    )!;

  it("normalises per active day so a long run does not win by default", () => {
    // A: 100 units in 300 days; B: 60 units in 30 days.
    const m = metric("Units / active day", row, {
      ...row,
      units: 60,
      daysOnSale: 30,
    });
    expect(m.a).toBeCloseTo(1 / 3);
    expect(m.b).toBeCloseTo(2);
    expect(compareWinner(m)).toBe("b");
  });
  it("lower food cost per unit wins", () => {
    const m = metric("Food cost / unit", row, { ...row, fcPerc: 0.2 });
    expect(compareWinner(m)).toBe("b");
  });
  it("has no winner on missing values, ties or context rows", () => {
    expect(
      compareWinner(metric("Offer margin", row, { ...row, fcPerc: null })),
    ).toBeNull();
    expect(compareWinner(metric("Units / active day", row, row))).toBeNull();
    expect(
      compareWinner(metric("Lifetime units", row, { ...row, units: 1 })),
    ).toBeNull();
  });
});

describe("weekly curve and weekday mix", () => {
  const daily: OfferDailyRow[] = [
    { code: "A", day: "2026-11-02", units: 3, orders: 3, net: 30 }, // Monday
    { code: "A", day: "2026-11-08", units: 2, orders: 2, net: 20 }, // Sunday
    { code: "A", day: "2026-11-23", units: 5, orders: 5, net: 50 }, // Monday, week 3
    { code: "B", day: "2026-11-03", units: 7, orders: 7, net: 70 },
  ];

  it("buckets units into weeks since launch, keeping pauses as 0", () => {
    expect(weeklyCurve(daily, "A")).toEqual([5, 0, 0, 5]);
    expect(weeklyCurve(daily, "B")).toEqual([7]);
    expect(weeklyCurve(daily, "C")).toEqual([]);
  });
  it("splits units by weekday, Monday first, summing to 1", () => {
    const mix = weekdayMix(daily, "A");
    expect(mix[0]).toBeCloseTo(0.8);
    expect(mix[6]).toBeCloseTo(0.2);
    expect(mix.reduce((s, v) => s + v, 0)).toBeCloseTo(1);
    expect(weekdayMix(daily, "C")).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("parseOfferDateRange", () => {
  const parse = (query: string) =>
    parseOfferDateRange(new URLSearchParams(query));

  it("is all time (null) unless both ends are valid days", () => {
    expect(parse("")).toBeNull();
    expect(parse("from=2026-01-01")).toBeNull();
    expect(parse("from=2026-02-30&to=2026-03-01")).toBeNull();
  });
  it("swaps reversed ends", () => {
    expect(parse("from=2026-03-01&to=2026-01-01")).toEqual({
      from: "2026-01-01",
      to: "2026-03-01",
    });
  });
});
