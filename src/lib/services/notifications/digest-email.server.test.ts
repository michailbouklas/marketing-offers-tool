import { describe, expect, it } from "vitest";
import { buildDigestEmail } from "./digest-email.server";
import type { QueueRow } from "./types";

function row(overrides: Partial<QueueRow>): QueueRow {
  return {
    id: 1,
    offerId: 1,
    restaurantId: 10,
    aggregatorId: 2,
    sessionId: 1,
    productId: null,
    entityKey: "2:10",
    title: "Offer",
    description: null,
    createdAt: new Date("2026-06-08T00:00:00Z"),
    ...overrides,
  };
}

describe("buildDigestEmail", () => {
  it("uses a singular subject for one offer", () => {
    const { subject } = buildDigestEmail(
      [row({ title: "2-for-1" })],
      new Map(),
    );
    expect(subject).toBe("1 new competitor offer");
  });

  it("uses a plural subject and counts multiple offers", () => {
    const { subject } = buildDigestEmail(
      [row({ id: 1 }), row({ id: 2 })],
      new Map(),
    );
    expect(subject).toBe("2 new competitor offers");
  });

  it("groups offers by restaurant and uses provided names", () => {
    const rows = [
      row({ id: 1, restaurantId: 10, title: "Burger deal" }),
      row({ id: 2, restaurantId: 20, title: "Pizza deal" }),
    ];
    const names = new Map([
      [10, "KFC City"],
      [20, "Pizza Place"],
    ]);

    const { text, html } = buildDigestEmail(rows, names);

    expect(text).toContain("KFC City (1):");
    expect(text).toContain("Pizza Place (1):");
    expect(text).toContain("Burger deal");
    expect(html).toContain("KFC City");
    expect(html).toContain("Pizza Place");
  });

  it("falls back to a placeholder when the restaurant name is unknown", () => {
    const { text } = buildDigestEmail([row({ restaurantId: 99 })], new Map());
    expect(text).toContain("Restaurant #99");
  });

  it("escapes HTML in titles and descriptions", () => {
    const { html } = buildDigestEmail(
      [row({ title: "<b>50% off</b>", description: "a & b" })],
      new Map(),
    );
    expect(html).toContain("&lt;b&gt;50% off&lt;/b&gt;");
    expect(html).toContain("a &amp; b");
    expect(html).not.toContain("<b>50% off</b>");
  });

  it("renders descriptions only when present", () => {
    const { text } = buildDigestEmail(
      [
        row({ id: 1, title: "With desc", description: "details" }),
        row({ id: 2, title: "No desc", description: null }),
      ],
      new Map([[10, "Place"]]),
    );
    expect(text).toContain("With desc — details");
    expect(text).toContain("• No desc");
  });
});
