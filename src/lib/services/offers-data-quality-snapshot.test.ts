import { describe, expect, it } from "vitest";
import {
  buildGapQueueSnapshotRows,
  isMissingOfferPricing,
  type BuildGapQueueSnapshotInput,
  type TrackedGapRecord,
} from "./offers-data-quality-snapshot";

const unpriced = {
  channel: null,
  category: null,
  subcategory: null,
  ideal_price: 0,
  selling_price: 5.99,
  fc_perc: 0,
  mktg_spend: null,
};

const priced = {
  channel: "Wolt",
  category: "Meals",
  subcategory: "Combo",
  ideal_price: 9.9,
  selling_price: 8.5,
  fc_perc: 0.32,
  mktg_spend: null,
};

function tracked(overrides: Partial<TrackedGapRecord>): TrackedGapRecord {
  return {
    dq_id: 7,
    trde_item: "ITM-7",
    item_name: "Tracked item",
    brand: "kfc",
    item_category: "Offers KFC",
    missing_fields: "ideal_price,fc_perc",
    detected_at: new Date("2026-03-26T10:00:00.000Z"),
    status: "submitted",
    ...overrides,
  };
}

function input(
  overrides: Partial<BuildGapQueueSnapshotInput>,
): BuildGapQueueSnapshotInput {
  return {
    eligibleItems: new Map(),
    transactedItems: [],
    dimOffers: new Map(),
    trackedGaps: [],
    recentlyResolvedItemCodes: new Set(),
    ...overrides,
  };
}

describe("isMissingOfferPricing", () => {
  it("treats no row, null and zero ideal price as missing", () => {
    expect(isMissingOfferPricing(undefined)).toBe(true);
    expect(isMissingOfferPricing({ ...priced, ideal_price: null })).toBe(true);
    expect(isMissingOfferPricing(unpriced)).toBe(true);
    expect(isMissingOfferPricing(priced)).toBe(false);
  });
});

describe("buildGapQueueSnapshotRows", () => {
  it("builds rows from ClickHouse items and PostgreSQL statuses", () => {
    const result = buildGapQueueSnapshotRows(
      input({
        eligibleItems: new Map([
          [
            "ITM-7",
            {
              item_code: "ITM-7",
              item_name: "Tracked item",
              item_category: "Offers KFC",
            },
          ],
          [
            "ITM-8",
            {
              item_code: "ITM-8",
              item_name: "Fresh item",
              item_category: "Offers BK",
            },
          ],
        ]),
        transactedItems: [
          { trde_item: "ITM-7", brand: "kfc", brand_aliases: ["kfc"] },
          {
            trde_item: "ITM-8",
            brand: "bk",
            brand_aliases: ["bk", "bk online"],
          },
        ],
        dimOffers: new Map([["ITM-7", unpriced]]),
        trackedGaps: [tracked({})],
      }),
    );

    expect(result.resolveGapIds).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.find((row) => row.trde_item === "ITM-7")).toMatchObject({
      dq_id: 7,
      status: "submitted",
      missing_fields: "ideal_price,fc_perc",
      detected_at: new Date("2026-03-26T10:00:00.000Z"),
      source: "transactions",
    });
    expect(result.rows.find((row) => row.trde_item === "ITM-8")).toMatchObject({
      dq_id: null,
      status: "open",
      detected_at: null,
      missing_fields: "ideal_price,selling_price,fc_perc",
      brand: "bk",
      brand_aliases: ["bk", "bk online"],
    });
  });

  it("ignores transacted items outside the eligible offer set", () => {
    const result = buildGapQueueSnapshotRows(
      input({
        transactedItems: [
          { trde_item: "ITM-X", brand: "kfc", brand_aliases: ["kfc"] },
        ],
      }),
    );

    expect(result.rows).toEqual([]);
  });

  it("skips untracked items resolved inside the grace window", () => {
    const result = buildGapQueueSnapshotRows(
      input({
        eligibleItems: new Map([
          [
            "ITM-JUST-APPROVED",
            {
              item_code: "ITM-JUST-APPROVED",
              item_name: "Approved an hour ago",
              item_category: "Offers KFC",
            },
          ],
        ]),
        transactedItems: [
          {
            trde_item: "ITM-JUST-APPROVED",
            brand: "kfc",
            brand_aliases: ["kfc"],
          },
        ],
        recentlyResolvedItemCodes: new Set(["ITM-JUST-APPROVED"]),
      }),
    );

    expect(result.rows).toEqual([]);
  });

  it("resolves open gaps that are now priced but keeps submitted ones visible", () => {
    const result = buildGapQueueSnapshotRows(
      input({
        eligibleItems: new Map([
          [
            "ITM-7",
            {
              item_code: "ITM-7",
              item_name: "Tracked item",
              item_category: "Offers KFC",
            },
          ],
          [
            "ITM-9",
            {
              item_code: "ITM-9",
              item_name: "Awaiting approval",
              item_category: "Offers KFC",
            },
          ],
        ]),
        transactedItems: [
          { trde_item: "ITM-7", brand: "kfc", brand_aliases: ["kfc"] },
          { trde_item: "ITM-9", brand: "kfc", brand_aliases: ["kfc"] },
        ],
        dimOffers: new Map([
          ["ITM-7", priced],
          ["ITM-9", priced],
        ]),
        trackedGaps: [
          tracked({ dq_id: 7, trde_item: "ITM-7", status: "open" }),
          tracked({ dq_id: 9, trde_item: "ITM-9", status: "submitted" }),
        ],
      }),
    );

    expect(result.resolveGapIds).toEqual([7]);
    expect(result.rows.map((row) => row.trde_item)).toEqual(["ITM-9"]);
    expect(result.rows[0]).toMatchObject({ dq_id: 9, status: "submitted" });
  });

  it("hides a tracked-only gap when its item no longer qualifies as an offer", () => {
    const result = buildGapQueueSnapshotRows(
      input({
        trackedGaps: [
          tracked({
            dq_id: 21,
            trde_item: "ITM-RECATEGORIZED",
            status: "open",
          }),
        ],
      }),
    );

    expect(result.rows).toEqual([]);
    expect(result.resolveGapIds).toEqual([21]);
  });

  it("keeps a tracked-only gap visible when its item is still an active offer", () => {
    const result = buildGapQueueSnapshotRows(
      input({
        eligibleItems: new Map([
          [
            "ITM-ACTIVE",
            {
              item_code: "ITM-ACTIVE",
              item_name: "Quiet active item",
              item_category: "Offers KFC",
            },
          ],
        ]),
        trackedGaps: [
          tracked({
            dq_id: 31,
            trde_item: "ITM-ACTIVE",
            item_name: "Quiet active item",
            missing_fields: "ideal_price,selling_price",
            status: "submitted",
          }),
        ],
      }),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      dq_id: 31,
      trde_item: "ITM-ACTIVE",
      status: "submitted",
      missing_fields: "ideal_price,selling_price",
      brand_aliases: ["kfc"],
      source: "tracked",
    });
    expect(result.gapContextUpdates).toEqual([]);
  });

  it("reports tracked gaps whose ClickHouse item context changed", () => {
    const result = buildGapQueueSnapshotRows(
      input({
        eligibleItems: new Map([
          [
            "ITM-7",
            {
              item_code: "ITM-7",
              item_name: "Renamed item",
              item_category: "Offers KFC",
            },
          ],
        ]),
        transactedItems: [
          {
            trde_item: "ITM-7",
            brand: "KFC",
            brand_aliases: ["kfc", "kfc delivery"],
          },
        ],
        trackedGaps: [tracked({ status: "open" })],
      }),
    );

    expect(result.gapContextUpdates).toEqual([
      {
        dq_id: 7,
        item_name: "Renamed item",
        brand: "KFC",
        item_category: "Offers KFC",
      },
    ]);
    expect(result.rows[0]).toMatchObject({
      item_name: "Renamed item",
      brand: "KFC",
      brand_aliases: ["kfc", "kfc delivery"],
    });
  });

  it("uses the most recent active record when an item has several", () => {
    const result = buildGapQueueSnapshotRows(
      input({
        eligibleItems: new Map([
          [
            "ITM-7",
            {
              item_code: "ITM-7",
              item_name: "Tracked item",
              item_category: "Offers KFC",
            },
          ],
        ]),
        trackedGaps: [
          tracked({ dq_id: 70, status: "submitted" }),
          tracked({ dq_id: 7, status: "open" }),
          tracked({ dq_id: 1, status: "resolved" }),
        ],
      }),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ dq_id: 70, status: "submitted" });
  });
});
