import { describe, expect, it } from "vitest";
import {
  offerReason,
  unitFoodCost,
  valueOffer,
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
