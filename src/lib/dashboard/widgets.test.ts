import { describe, expect, it } from "vitest";
import {
  availableWidgets,
  dismissedWidgets,
  normalizeLayout,
  resolvePeriod,
} from "./widgets";

const ids = (layout: { id: string }[]) => layout.map((widget) => widget.id);

describe("normalizeLayout", () => {
  it("defaults to every widget the role may see", () => {
    expect(ids(normalizeLayout(null, "offerEditor"))).toEqual([
      "open-gaps",
      "latest-release",
    ]);
    expect(ids(normalizeLayout(null, "approver,analyticsViewer"))).toEqual([
      "awaiting-approval",
      "sales-summary",
      "delivery-summary",
      "offers-summary",
      "latest-release",
    ]);
    expect(normalizeLayout(null, "superUser")).toHaveLength(6);
    expect(ids(normalizeLayout(null, "user"))).toEqual(["latest-release"]);
  });

  it("keeps saved order and drops unknown, forbidden and repeated widgets", () => {
    const saved = {
      widgets: [
        { id: "offers-summary", type: "offers-summary", settings: {} },
        { id: "nope", type: "nope", settings: {} },
        { id: "open-gaps", type: "open-gaps", settings: {} },
        { id: "sales-summary", type: "sales-summary", settings: {} },
        { id: "offers-summary", type: "offers-summary", settings: {} },
      ],
    };
    expect(ids(normalizeLayout(saved, "analyticsViewer"))).toEqual([
      "offers-summary",
      "sales-summary",
      "latest-release",
    ]);
  });

  it("keeps several copies of a type with different ids", () => {
    const layout = normalizeLayout(
      {
        widgets: [
          { id: "offers-summary", type: "offers-summary", settings: {} },
          {
            id: "offers-summary-m1",
            type: "offers-summary",
            settings: { brand: "bk", period: "wtd" },
          },
          { id: "offers-summary-m1", type: "offers-summary", settings: {} },
          { id: "Bad Id", type: "offers-summary", settings: {} },
        ],
      },
      "analyticsViewer",
    );
    expect(ids(layout)).toEqual([
      "offers-summary",
      "offers-summary-m1",
      "latest-release",
    ]);
    expect(layout[1].settings).toEqual({ brand: "bk", period: "wtd" });
  });

  it("uses the type as id by default and resets layouts without types", () => {
    for (const widget of normalizeLayout(null, "superUser")) {
      expect(widget.id).toBe(widget.type);
    }
    expect(
      ids(
        normalizeLayout(
          { widgets: [{ id: "offers-summary", settings: {} }] },
          "analyticsViewer",
        ),
      ),
    ).toEqual([
      "sales-summary",
      "delivery-summary",
      "offers-summary",
      "latest-release",
    ]);
  });

  it("adds default-on widgets to saved layouts unless dismissed", () => {
    const saved = {
      widgets: [{ id: "open-gaps", type: "open-gaps", settings: {} }],
    };
    expect(ids(normalizeLayout(saved, "offerEditor"))).toEqual([
      "open-gaps",
      "latest-release",
    ]);
    const off = { ...saved, dismissed: ["latest-release", "nope"] };
    expect(ids(normalizeLayout(off, "offerEditor"))).toEqual(["open-gaps"]);
    expect(dismissedWidgets(off)).toEqual(["latest-release"]);
  });

  it("keeps an emptied dashboard empty once the defaults are dismissed", () => {
    expect(
      normalizeLayout({ widgets: [], dismissed: ["latest-release"] }, "admin"),
    ).toEqual([]);
  });

  it("falls back to default settings when saved ones are invalid", () => {
    const [widget] = normalizeLayout(
      {
        widgets: [
          {
            id: "sales-summary",
            type: "sales-summary",
            settings: { period: "decade" },
          },
        ],
      },
      "admin",
    );
    expect(widget.settings).toEqual({ brand: null, period: "wtd" });

    const [valid] = normalizeLayout(
      {
        widgets: [
          {
            id: "sales-summary",
            type: "sales-summary",
            settings: { brand: "phcy", period: "mtd" },
          },
        ],
      },
      "admin",
    );
    expect(valid.settings).toEqual({ brand: "phcy", period: "mtd" });
  });

  it("lists the widgets the role may still add", () => {
    const layout = normalizeLayout(
      {
        widgets: [{ id: "sales-summary", type: "sales-summary", settings: {} }],
      },
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
