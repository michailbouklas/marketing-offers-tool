import { describe, expect, it } from "vitest";
import { availableWidgets, normalizeLayout, resolvePeriod } from "./widgets";

const ids = (layout: { id: string }[]) => layout.map((widget) => widget.id);

describe("normalizeLayout", () => {
  it("defaults to every widget the role may see", () => {
    expect(ids(normalizeLayout(null, "offerEditor"))).toEqual(["open-gaps"]);
    expect(ids(normalizeLayout(null, "approver,analyticsViewer"))).toEqual([
      "awaiting-approval",
      "sales-summary",
      "delivery-summary",
      "offers-summary",
    ]);
    expect(normalizeLayout(null, "superUser")).toHaveLength(5);
    expect(normalizeLayout(null, "user")).toEqual([]);
  });

  it("keeps saved order and drops unknown, forbidden and repeated widgets", () => {
    const saved = {
      widgets: [
        { id: "offers-summary", settings: {} },
        { id: "nope", settings: {} },
        { id: "open-gaps", settings: {} },
        { id: "sales-summary", settings: {} },
        { id: "offers-summary", settings: {} },
      ],
    };
    expect(ids(normalizeLayout(saved, "analyticsViewer"))).toEqual([
      "offers-summary",
      "sales-summary",
    ]);
  });

  it("keeps an emptied dashboard empty", () => {
    expect(normalizeLayout({ widgets: [] }, "admin")).toEqual([]);
  });

  it("falls back to default settings when saved ones are invalid", () => {
    const [widget] = normalizeLayout(
      { widgets: [{ id: "sales-summary", settings: { period: "decade" } }] },
      "admin",
    );
    expect(widget.settings).toEqual({ brand: null, period: "wtd" });

    const [valid] = normalizeLayout(
      {
        widgets: [
          { id: "sales-summary", settings: { brand: "phcy", period: "mtd" } },
        ],
      },
      "admin",
    );
    expect(valid.settings).toEqual({ brand: "phcy", period: "mtd" });
  });

  it("lists the widgets the role may still add", () => {
    const layout = normalizeLayout(
      { widgets: [{ id: "sales-summary", settings: {} }] },
      "analyticsViewer",
    );
    expect(availableWidgets(layout, "analyticsViewer")).toEqual([
      "delivery-summary",
      "offers-summary",
    ]);
  });
});

describe("resolvePeriod", () => {
  // 2026-11-12 is a Thursday.
  it("anchors every period on the latest sales day", () => {
    const to = "2026-11-12";
    expect(resolvePeriod("wtd", to)).toEqual({ from: "2026-11-09", to });
    expect(resolvePeriod("mtd", to)).toEqual({ from: "2026-11-01", to });
    expect(resolvePeriod("ytd", to)).toEqual({ from: "2026-01-01", to });
    expect(resolvePeriod("last7", to)).toEqual({ from: "2026-11-06", to });
    expect(resolvePeriod("last30", to)).toEqual({ from: "2026-10-14", to });
  });

  it("starts WTD on the day itself when the latest day is a Monday", () => {
    expect(resolvePeriod("wtd", "2026-11-09").from).toBe("2026-11-09");
  });
});
