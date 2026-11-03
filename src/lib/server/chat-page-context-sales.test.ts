import { describe, expect, it } from "vitest";
import { EXPLORE_AI_MAX_ORDERS } from "$lib/services/sales-explore";
import { resolveSalesSelectedOrders } from "./chat-page-context";

describe("resolveSalesSelectedOrders", () => {
  it("returns nothing for non-objects and missing orders", () => {
    expect(resolveSalesSelectedOrders(undefined)).toEqual([]);
    expect(resolveSalesSelectedOrders(["2026-10-01_1_2_3"])).toEqual([]);
    expect(resolveSalesSelectedOrders({ orders: "2026-10-01_1_2_3" })).toEqual(
      [],
    );
  });

  it("keeps well-formed pks only, deduplicated", () => {
    expect(
      resolveSalesSelectedOrders({
        orders: [
          "2026-10-01_1_2_3",
          "2026-10-01_1_2_3",
          "2026-10-01_1_2_3' OR 1=1",
          42,
          "2026-10-02_12_30_4567",
        ],
      }),
    ).toEqual(["2026-10-01_1_2_3", "2026-10-02_12_30_4567"]);
  });

  it("caps at EXPLORE_AI_MAX_ORDERS", () => {
    const orders = Array.from(
      { length: EXPLORE_AI_MAX_ORDERS + 5 },
      (_, i) => `2026-10-01_1_1_${i}`,
    );
    expect(resolveSalesSelectedOrders({ orders })).toHaveLength(
      EXPLORE_AI_MAX_ORDERS,
    );
  });
});
