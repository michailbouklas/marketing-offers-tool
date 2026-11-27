import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("./offers-data-quality-clickhouse.server", () => ({
  getCurrentDimOfferValues: vi.fn(),
  getDimOfferAuditSnapshot: vi.fn(),
  getDimOffersByItemCodes: vi.fn(async () => new Map()),
  getOfferEligibleItemCodes: vi.fn(),
  getTransactionItemContext: vi.fn(),
  getTransactionItemContexts: vi.fn(async () => new Map()),
  insertDimOffer: vi.fn(),
  listOfferEligibleItems: vi.fn(),
  listTransactedOfferItems: vi.fn(),
  updateDimOffer: vi.fn(),
}));

vi.mock("./offers-data-quality-snapshot.server", () => ({
  getLatestSuccessfulSnapshotRefresh: vi.fn(),
  getSnapshotRowByGapId: vi.fn(),
  getSnapshotRowByItemCode: vi.fn(),
  queryGapQueuePage: vi.fn(),
  upsertSnapshotRow: vi.fn(),
}));

vi.mock("./gap-queue-snapshot.server", () => ({
  tryRebuildGapQueueSnapshotExclusively: vi.fn(),
}));

vi.mock("$lib/server/env", () => ({
  getDataQualityEnv: () => ({
    DQ_SNAPSHOT_ENABLED: true,
    DQ_SNAPSHOT_CRON: "0 4 * * *",
    DQ_SNAPSHOT_TIMEZONE: "Europe/Nicosia",
    DQ_SNAPSHOT_RESOLVED_GRACE_HOURS: 24,
    DQ_QUEUE_CACHE_TTL_MS: 60_000,
  }),
}));

vi.mock("./dim-offers-audit.server", () => ({
  createDimOffersAuditRecord: vi.fn(),
}));

vi.mock("./offers-data-quality-postgres.server", () => ({
  createGapRecord: vi.fn(),
  getGapRecordById: vi.fn(),
  getGapRecordByItemCode: vi.fn(),
  getGapRecordsByIds: vi.fn(),
  getPendingStagingRecordByItemCode: vi.fn(),
  getStagingRecordById: vi.fn(),
  listPendingStagingRecords: vi.fn(),
  listCachedOfferSales: vi.fn(),
  listGapRecords: vi.fn(),
  listRecentlyResolvedItemCodes: vi.fn(),
  updateDimOffersStagingStatus: vi.fn(),
  updateGapRecordStatus: vi.fn(),
}));

vi.mock("$lib/services/brands.server", () => ({
  getBrandPricingTargetByAlias: vi.fn(async () => null),
}));

const clickhouseDeps = await import("./offers-data-quality-clickhouse.server");
const brandDeps = await import("$lib/services/brands.server");
const auditDeps = await import("./dim-offers-audit.server");
const postgresDeps = await import("./offers-data-quality-postgres.server");
const snapshotDeps = await import("./offers-data-quality-snapshot.server");
const rebuildDeps = await import("./gap-queue-snapshot.server");
const cache = await import("$lib/server/gap-queue-cache.server");
const helpers = await import("./offers-data-quality");
const orchestration = await import("./offers-data-quality.server");

const serviceDeps = {
  getCurrentDimOfferValues: clickhouseDeps.getCurrentDimOfferValues as Mock,
  getDimOfferAuditSnapshot: clickhouseDeps.getDimOfferAuditSnapshot as Mock,
  getOfferEligibleItemCodes: clickhouseDeps.getOfferEligibleItemCodes as Mock,
  getTransactionItemContext: clickhouseDeps.getTransactionItemContext as Mock,
  insertDimOffer: clickhouseDeps.insertDimOffer as Mock,
  getDimOffersByItemCodes: clickhouseDeps.getDimOffersByItemCodes as Mock,
  getTransactionItemContexts: clickhouseDeps.getTransactionItemContexts as Mock,
  updateDimOffer: clickhouseDeps.updateDimOffer as Mock,
  createDimOffersAuditRecord: auditDeps.createDimOffersAuditRecord as Mock,
  getGapRecordById: postgresDeps.getGapRecordById as Mock,
  getGapRecordByItemCode: postgresDeps.getGapRecordByItemCode as Mock,
  getGapRecordsByIds: postgresDeps.getGapRecordsByIds as Mock,
  createGapRecord: postgresDeps.createGapRecord as Mock,
  listPendingStagingRecords: postgresDeps.listPendingStagingRecords as Mock,
  getLatestSuccessfulSnapshotRefresh:
    snapshotDeps.getLatestSuccessfulSnapshotRefresh as Mock,
  getSnapshotRowByGapId: snapshotDeps.getSnapshotRowByGapId as Mock,
  getSnapshotRowByItemCode: snapshotDeps.getSnapshotRowByItemCode as Mock,
  queryGapQueuePage: snapshotDeps.queryGapQueuePage as Mock,
  upsertSnapshotRow: snapshotDeps.upsertSnapshotRow as Mock,
  tryRebuildGapQueueSnapshotExclusively:
    rebuildDeps.tryRebuildGapQueueSnapshotExclusively as Mock,
  getPendingStagingRecordByItemCode:
    postgresDeps.getPendingStagingRecordByItemCode as Mock,
  getStagingRecordById: postgresDeps.getStagingRecordById as Mock,
  listGapRecords: postgresDeps.listGapRecords as Mock,
  updateDimOffersStagingStatus:
    postgresDeps.updateDimOffersStagingStatus as Mock,
  updateGapRecordStatus: postgresDeps.updateGapRecordStatus as Mock,
  getBrandPricingTargetByAlias: brandDeps.getBrandPricingTargetByAlias as Mock,
};

describe("offers-data-quality helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes an approved offer as one safe CSV line", () => {
    const offer = {
      id: 1,
      trde_item: "ITM-1",
      item_name: 'Bucket, "XL"',
      brand: "KFC",
      channel: "Wolt Only",
      category: "ONEPLUSX",
      subcategory: "Sub",
      fc_eur: null,
      brand_ideal_fc_perc: null,
      ideal_price: "12.00",
      selling_price: "9.50",
      fc_perc: "31.25",
      mktg_spend: null,
      notes: "=SUM(A1)",
      submitted_by_name: "Ann",
      submitted_at: "2026-03-01T22:30:00.000Z",
      approved_by_name: null,
      approved_at: "2026-03-02T08:00:00.000Z",
    };
    const line = helpers.approvedOfferCsvLine(offer);

    expect(line).toBe(
      'ITM-1,"Bucket, ""XL""",KFC,Wolt Only,ONEPLUSX,Sub,,,12.00,9.50,31.25,,,,,,, =SUM(A1),Ann,2026-03-01,,2026-03-02',
    );
    expect(line.split(",").length - 1).toBe(
      helpers.approvedOffersCsvHeader.split(",").length,
    );

    // 4 units for 40.00 net = 10.50 incl. VAT; food cost 4 x 2.50.
    const sold = {
      units: 4,
      orders: 3,
      offerNet: 40,
      daysOnSale: 2,
      lastSale: "2026-03-05",
    };
    expect(
      helpers.approvedOfferCsvLine({ ...offer, fc_eur: "2.50" }, sold),
    ).toContain(",31.25,10.00,10.50,4,3,40.00,,");
    expect(helpers.approvedOfferCsvLine(offer, sold)).toContain(
      ",31.25,,10.50,4,3,40.00,,",
    );
  });

  it("summarizes approved offers: recomputed FC %, self-approvals and data problems", () => {
    const row = {
      brand: "KFC",
      channel: "Wolt Only",
      category: "BundleDisc",
      subcategory: "LTO",
      fc_eur: 3,
      brand_ideal_fc_perc: 0.3,
      ideal_price: 11.24,
      // 3 / (8 / 1.05 / 1.07) = 42.13%, 12.13 points over the 30% target.
      selling_price: 8,
      fc_perc: 0.4213,
      submitted_by: "ann",
      submitted_at: new Date("2026-11-01T08:00:00Z"),
      approved_by: "bob",
      approved_at: new Date("2026-11-01T10:00:00Z"),
    };
    const summary = helpers.summarizeApprovedOffers(
      [
        row,
        // Self-approved, stored FC % is the gross ratio (3 / 8), not the formula.
        { ...row, fc_perc: 0.375, approved_by: "ann" },
        // Legacy row: no FC EUR, free selling price, channel not in the list.
        {
          ...row,
          brand: "BK",
          channel: "0",
          fc_eur: null,
          brand_ideal_fc_perc: null,
          selling_price: 0,
          approved_at: new Date("2026-12-02T08:00:00Z"),
        },
      ],
      ["Wolt Only"],
    );

    expect(summary.total).toBe(3);
    expect(summary.selfApproved).toBe(1);
    expect(summary.medianHoursToApprove).toBe(2);
    expect(summary.problems).toEqual({
      any: 2,
      noFcEur: 1,
      zeroSellingPrice: 1,
      fcPercMismatch: 1,
      unknownChannel: 1,
    });
    expect(summary.brands.map((brand) => brand.label)).toEqual(["KFC", "BK"]);
    expect(summary.brands[0]).toMatchObject({
      approved: 2,
      checkable: 2,
      overWarn: 2,
      overHigh: 2,
      aboveIdeal: 0,
    });
    expect(summary.brands[0].avgPointsOverTarget).toBeCloseTo(12.13, 2);
    expect(summary.brands[0].avgDiscountPct).toBeCloseTo(28.83, 2);
    // A selling price of 0 is a data error, not a 100% discount.
    expect(summary.brands[1]).toMatchObject({
      checkable: 0,
      avgPointsOverTarget: null,
      avgDiscountPct: null,
    });
    expect(summary.months).toEqual([
      { month: "2026-11", approved: 2 },
      { month: "2026-12", approved: 1 },
    ]);
    expect(summary.approvers).toEqual([
      { approver: "bob", approved: 2, selfApproved: 0 },
      { approver: "ann", approved: 1, selfApproved: 1 },
    ]);
  });

  it("checks approved prices against POS sales and leaves mismatched prices out of the FC figure", () => {
    const row = {
      brand: "BK",
      trde_item: "A",
      channel: "Wolt Only",
      category: "BundleDisc",
      subcategory: "LTO",
      fc_eur: 4,
      brand_ideal_fc_perc: 0.3,
      ideal_price: 14,
      selling_price: 10.5,
      fc_perc: 0.4,
      submitted_by: "ann",
      submitted_at: new Date("2026-11-01T08:00:00Z"),
      approved_by: "bob",
      approved_at: new Date("2026-11-01T10:00:00Z"),
    };
    const sold = { daysOnSale: 10, lastSale: "2026-11-20", orders: 100 };
    const check = helpers.summarizeOfferSales(
      [
        // Charged 10.00 net = 10.50 gross: matches. 100 x 4 / 1000 = 40% FC.
        row,
        // Approved twice: counted once.
        row,
        // Charged 5.25 gross against 10.50 approved: a placeholder price.
        { ...row, trde_item: "B", fc_eur: 20 },
        // Never sold.
        { ...row, trde_item: "C" },
      ],
      new Map([
        ["bk|A", { ...sold, units: 100, offerNet: 1000 }],
        ["bk|B", { ...sold, units: 100, offerNet: 500 }],
      ]),
    );

    expect(check).toHaveLength(1);
    expect(check[0]).toMatchObject({
      label: "BK",
      sold: 2,
      priceMismatch: 1,
      checked: 1,
      net: 1000,
    });
    expect(check[0].realFcPct).toBeCloseTo(40, 5);
    expect(check[0].targetPct).toBeCloseTo(30, 5);
    expect(check[0].eurAboveTarget).toBeCloseTo(100, 5);
  });

  it("prices an offer at what the POS charged per unit, incl. VAT", () => {
    const sold = { orders: 3, daysOnSale: 1, lastSale: "2026-11-20" };
    expect(
      helpers.chargedPrice({ ...sold, units: 4, offerNet: 40 }),
    ).toBeCloseTo(10.5, 5);
    expect(
      helpers.chargedPrice({ ...sold, units: 0, offerNet: 40 }),
    ).toBeNull();
  });

  it("ranks unpriced offers that sell now and counts the ones that no longer sell", () => {
    const gap = (dq_id: number, trde_item: string) => ({
      dq_id,
      brand: " bk ",
      trde_item,
      item_name: trde_item,
    });
    const sale = (lastSale: string, offerNet: number) => ({
      units: 1,
      orders: 1,
      offerNet,
      daysOnSale: 10,
      lastSale,
    });
    const result = helpers.rankLiveGaps(
      [
        gap(1, "SMALL"),
        gap(2, "BIG"),
        gap(3, "OLD"),
        gap(4, "NEVER"),
        gap(5, "QUIET"),
      ],
      new Map([
        ["bk|SMALL", sale("2026-11-20", 100)],
        ["bk|BIG", sale("2026-10-26", 900)],
        ["bk|OLD", sale("2026-01-01", 5000)],
        // Sold two months ago: neither live nor dead.
        ["bk|QUIET", sale("2026-09-20", 700)],
      ]),
      new Date("2026-11-24T12:00:00Z"),
    );

    expect(result.total).toBe(5);
    expect(result.dead).toBe(2);
    expect(result.live.map((item) => [item.trde_item, item.netPerDay])).toEqual(
      [
        ["BIG", 90],
        ["SMALL", 10],
      ],
    );
    expect(result.live[0].brand).toBe("BK");
  });

  it("parses comma-separated missing fields", () => {
    expect(helpers.parseMissingFields("ideal_price, fc_perc, unknown")).toEqual(
      ["ideal_price", "fc_perc"],
    );
  });

  it("maps load response values into form defaults", () => {
    const form = helpers.mapGapLoadResponseToGapPricingFormData({
      dq_id: 1,
      trde_item: "ITM-1",
      item_name: "Item",
      brand: "KFC",
      item_category: "Offers",
      detected_at: new Date().toISOString(),
      status: "open",
      missing_fields: ["ideal_price", "fc_perc"],
      current_dim_offers: {
        channel: "Wolt Only",
        category: "ONEPLUSX",
        subcategory: "% Disc",
        ideal_price: 0,
        selling_price: 5.99,
        fc_perc: 0,
        fc_eur: 3,
        mktg_spend: null,
      },
      brand_target: { brand_id: 1, brand_name: "KFC", ideal_fc_perc: 0.3 },
    });

    expect(form).toEqual({
      channel: "Wolt Only",
      category: "ONEPLUSX",
      subcategory: "% Disc",
      // (3 / 0.30) x 1.05 x 1.07 = 11.235 -> 11.24, regardless of the stored 0
      ideal_price: "11.24",
      selling_price: "5.99",
      // 3 / (5.99 / 1.05 / 1.07) = 0.5627, ignoring the stored 0
      fc_perc: "56.27",
      fc_eur: "3",
      brand_ideal_fc_perc: "30",
      mktg_spend: "",
      notes: "",
    });
  });

  it("leaves fc_eur and ideal price blank when the brand has no target", () => {
    const form = helpers.mapGapLoadResponseToGapPricingFormData({
      dq_id: 1,
      trde_item: "ITM-1",
      item_name: "Item",
      brand: "KFC",
      item_category: "Offers",
      detected_at: new Date().toISOString(),
      status: "open",
      missing_fields: ["ideal_price", "fc_eur"],
      current_dim_offers: {
        channel: null,
        category: null,
        subcategory: null,
        ideal_price: 9.5,
        selling_price: 5.99,
        fc_perc: 0.3,
        fc_eur: null,
        mktg_spend: null,
      },
      brand_target: null,
    });

    expect(form).toMatchObject({
      ideal_price: "",
      fc_eur: "",
      brand_ideal_fc_perc: "",
      fc_perc: "",
    });
  });

  it("calculates ideal price as (fc_eur / brand fc) x 1.05 x 1.07 in cents", () => {
    expect(helpers.IDEAL_PRICE_MARKUP_FACTORS).toEqual([1.05, 1.07]);
    expect(helpers.calculateIdealPrice(3, 0.3)).toBe(11.24);
    expect(helpers.calculateIdealPrice(15, 0.3)).toBe(56.18);
    expect(helpers.calculateIdealPrice(2.5, 0.25)).toBe(11.24);
    expect(helpers.calculateIdealPrice(0, 0.3)).toBeNull();
    expect(helpers.calculateIdealPrice(3, 0)).toBeNull();
    expect(helpers.calculateIdealPrice(null, 0.3)).toBeNull();
    expect(helpers.calculateIdealPrice(3, null)).toBeNull();
    expect(helpers.calculateIdealPrice(-3, 0.3)).toBeNull();
    expect(helpers.calculateIdealPriceFromFormValues("3", "30")).toBe(11.24);
    expect(helpers.calculateIdealPriceFromFormValues("", "30")).toBeNull();
    expect(helpers.formatIdealPriceInput("3", "30")).toBe("11.24");
    expect(helpers.formatIdealPriceInput("3", "")).toBe("");
  });

  it("derives fc_perc as fc_eur / (selling / 1.05 / 1.07)", () => {
    expect(helpers.calculateFcPerc(3, 11.235)).toBe(0.3);
    expect(helpers.calculateFcPerc(3, 5.99)).toBe(0.5627);
    expect(helpers.calculateFcPerc(3, 2)).toBe(1.6853);
    expect(helpers.calculateFcPerc(3, 0)).toBeNull();
    expect(helpers.calculateFcPerc(0, 5)).toBeNull();
    expect(helpers.calculateFcPerc(null, 5)).toBeNull();
    expect(helpers.formatFcPercInput("3", "11.24")).toBe("29.99");
    expect(helpers.formatFcPercInput("3", "")).toBe("");
  });

  it("maps form data to submit payload and converts fc_perc", () => {
    const payload = helpers.mapGapPricingFormToPayload({
      ...helpers.getDefaultGapPricingFormData(),
      channel: "Wolt Only",
      category: "ONEPLUSX",
      subcategory: "% Disc",
      ideal_price: "8.50",
      selling_price: "0",
      fc_perc: "32",
      fc_eur: "2.40",
      brand_ideal_fc_perc: "30",
      mktg_spend: "1.25",
      notes: "hello",
    });

    // ideal_price and the brand target never travel to the API: the server
    // derives the price from fc_eur and the brand's stored target.
    expect(payload).toEqual({
      channel: "Wolt Only",
      category: "ONEPLUSX",
      subcategory: "% Disc",
      fc_eur: 2.4,
      selling_price: 0,
      mktg_spend: 1.25,
      notes: "hello",
    });
  });

  it("normalizes numeric values in the client form schema before cross-field validation", () => {
    const result = helpers.gapPricingFormSchema.safeParse({
      channel: "Wolt Only",
      category: "ONEPLUSX",
      subcategory: "% Disc",
      ideal_price: "",
      fc_eur: 15,
      brand_ideal_fc_perc: 30,
      selling_price: 45,
      fc_perc: 20,
      mktg_spend: 30,
      notes: "This is a test",
    });

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.data).toMatchObject({
      fc_eur: "15",
      brand_ideal_fc_perc: "30",
      selling_price: "45",
      fc_perc: "20",
      mktg_spend: "30",
    });
  });

  it("accepts a selling price above the ideal price (flagged, not blocked)", () => {
    const result = helpers.gapPricingFormSchema.safeParse({
      channel: "Wolt Only",
      category: "ONEPLUSX",
      subcategory: "% Disc",
      fc_eur: "3",
      brand_ideal_fc_perc: "30",
      selling_price: "11.25",
      fc_perc: "20",
      mktg_spend: "",
      notes: "",
    });

    expect(result.success).toBe(true);
    expect(helpers.isPriceAboveIdeal("11.25", "11.24")).toBe(true);
    expect(helpers.isPriceAboveIdeal("11.24", "11.24")).toBe(false);
    expect(helpers.isPriceAboveIdeal("11.25", "")).toBe(false);
  });

  it("flags a missing brand target on the client", () => {
    const result = helpers.gapPricingFormSchema.safeParse({
      channel: "Wolt Only",
      category: "ONEPLUSX",
      subcategory: "% Disc",
      fc_eur: "3",
      brand_ideal_fc_perc: "",
      selling_price: "5",
      fc_perc: "20",
      mktg_spend: "",
      notes: "",
    });

    expect(result.success).toBe(false);

    if (result.success) {
      return;
    }

    expect(helpers.getZodFieldErrors(result.error)).toHaveProperty(
      "brand_ideal_fc_perc",
    );
  });

  it("flags fc_eur as missing when null, undefined or zero", () => {
    const base = {
      channel: null,
      category: null,
      subcategory: null,
      ideal_price: 9.9,
      selling_price: 8.5,
      fc_perc: 0.3,
      fc_eur: 2.4,
      mktg_spend: null,
    };

    expect(
      helpers.getMissingFieldsFromCurrentValues({ ...base, fc_eur: null }),
    ).toEqual(["fc_eur"]);
    expect(
      helpers.getMissingFieldsFromCurrentValues({ ...base, fc_eur: 0 }),
    ).toEqual(["fc_eur"]);
    expect(
      helpers.getMissingFieldsFromCurrentValues({ ...base, fc_eur: 2.4 }),
    ).toEqual([]);
  });

  it("applies lookup defaults so selects are never empty when options exist", () => {
    const result = helpers.applyGapPricingLookupDefaults(
      helpers.getDefaultGapPricingFormData(),
      {
        channels: [{ id: 1, name: "Wolt Only" }],
        categories: [{ id: 2, name: "ONEPLUSX" }],
        subcategories: [{ id: 3, name: "% Disc" }],
      },
    );

    expect(result).toMatchObject({
      channel: "Wolt Only",
      category: "ONEPLUSX",
      subcategory: "% Disc",
    });
  });

  it("normalizes money and percent inputs to two decimals", () => {
    expect(helpers.normalizeMoneyInput("30")).toBe("30.00");
    expect(helpers.normalizeMoneyInput(50)).toBe("50.00");
    expect(helpers.normalizePercentInput("20")).toBe("20.00");
  });

  it("formats decimal helpers consistently", () => {
    expect(helpers.formatPricingDecimal(8.5)).toBe("8.50");
    expect(helpers.formatPricingDecimal(null)).toBeNull();
    expect(helpers.formatFractionalDecimal(0.32)).toBe("0.3200");
  });
});

const globalForGapQueue = globalThis as typeof globalThis & {
  gapQueueSnapshotReady?: boolean;
};

function buildPage(items: unknown[] = []) {
  return {
    items,
    totalItems: items.length,
    submittedCount: 0,
    page: 1,
    pageSize: 50,
    totalPages: 1,
  };
}

describe("offers-data-quality orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.invalidateGapQueueCache();
    globalForGapQueue.gapQueueSnapshotReady = undefined;
    serviceDeps.getOfferEligibleItemCodes.mockImplementation(
      async (itemCodes: string[]) => new Set(itemCodes),
    );
    serviceDeps.getLatestSuccessfulSnapshotRefresh.mockResolvedValue({
      id: 1,
      status: "succeeded",
      finished_at: new Date("2026-09-25T01:00:00.000Z"),
    });
    serviceDeps.getDimOffersByItemCodes.mockResolvedValue(new Map());
    serviceDeps.getTransactionItemContexts.mockResolvedValue(new Map());
  });

  it("approves a pending submission by updating an existing dim_offers row", async () => {
    serviceDeps.getStagingRecordById.mockResolvedValue({
      id: 42,
      dq_id: 9,
      item_code: "ITM-42",
      channel: "Wolt Only",
      category: "ONEPLUSX",
      subcategory: "% Disc",
      ideal_price: { toString: () => "8.5", toFixed: () => "8.50" },
      selling_price: { toString: () => "5.99", toFixed: () => "5.99" },
      fc_perc: { toFixed: () => "0.3200", valueOf: () => 0.32 },
      fc_eur: { toFixed: () => "2.40" },
      brand_ideal_fc_perc: { toFixed: () => "0.3000" },
      mktg_spend: { toFixed: () => "1.25" },
      status: "pending",
    });
    serviceDeps.getGapRecordById.mockResolvedValue({
      dq_id: 9,
      item_name: "Zinger Box Meal",
      brand: "kfc",
    });
    serviceDeps.getDimOfferAuditSnapshot.mockResolvedValue({
      item_code: "ITM-42",
      product_desc: "Old product",
      brand_alias: "kfc",
      channel: "Old Channel",
      category: "Old Category",
      subcategory: "Old Subcategory",
      ideal_price: "9.00",
      selling_price: "6.50",
      fc_perc: "0.3000",
      mktg_spend: "1.00",
      discount_amount: "2.50",
    });

    await orchestration.approveGapSubmission(42, "user-1");

    expect(serviceDeps.updateDimOffer).toHaveBeenCalledTimes(1);
    expect(serviceDeps.updateDimOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        item_code: "ITM-42",
        brand: "kfc",
        fc_eur: "2.40",
      }),
    );
    expect(serviceDeps.insertDimOffer).not.toHaveBeenCalled();
    expect(serviceDeps.createDimOffersAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        itemCode: "ITM-42",
        action: "update",
        changedBy: "user-1",
        stagingId: 42,
        dqId: 9,
        beforeValues: expect.objectContaining({
          item_code: "ITM-42",
        }),
        afterValues: expect.objectContaining({
          item_code: "ITM-42",
          brand_alias: "kfc",
          ideal_price: "8.50",
          selling_price: "5.99",
          fc_eur: "2.40",
          discount_amount: "2.51",
        }),
      }),
    );
    expect(serviceDeps.updateDimOffersStagingStatus).toHaveBeenCalledWith(
      42,
      "approved",
      "user-1",
    );
    expect(serviceDeps.updateGapRecordStatus).toHaveBeenCalledWith(
      9,
      "resolved",
    );
  });

  it("approves a pending submission by inserting a new dim_offers row when missing", async () => {
    serviceDeps.getStagingRecordById.mockResolvedValue({
      id: 11,
      dq_id: 7,
      item_code: "ITM-11",
      channel: "Bolt Only",
      category: "DiscValue",
      subcategory: "LTO",
      ideal_price: { toString: () => "4", toFixed: () => "4.00" },
      selling_price: { toString: () => "0", toFixed: () => "0.00" },
      fc_perc: { toFixed: () => "0.2500", valueOf: () => 0.25 },
      mktg_spend: null,
      status: "pending",
    });
    serviceDeps.getGapRecordById.mockResolvedValue({
      dq_id: 7,
      item_name: "Promo bucket",
      brand: "bk",
    });
    serviceDeps.getDimOfferAuditSnapshot.mockResolvedValue(null);

    await orchestration.approveGapSubmission(11, "user-2");

    expect(serviceDeps.insertDimOffer).toHaveBeenCalledTimes(1);
    expect(serviceDeps.insertDimOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        item_code: "ITM-11",
        brand: "bk",
      }),
    );
    expect(serviceDeps.updateDimOffer).not.toHaveBeenCalled();
    expect(serviceDeps.createDimOffersAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        itemCode: "ITM-11",
        action: "insert",
        changedBy: "user-2",
        beforeValues: null,
        afterValues: expect.objectContaining({
          item_code: "ITM-11",
          brand_alias: "bk",
          ideal_price: "4.00",
          selling_price: "0.00",
          discount_amount: "4.00",
        }),
      }),
    );
  });

  it("writes a zero discount when a flagged offer sells above ideal", async () => {
    serviceDeps.getStagingRecordById.mockResolvedValue({
      id: 12,
      dq_id: 7,
      item_code: "ITM-12",
      channel: "Bolt Only",
      category: "DiscValue",
      subcategory: "LTO",
      ideal_price: { toString: () => "4", toFixed: () => "4.00" },
      selling_price: { toString: () => "5", toFixed: () => "5.00" },
      fc_perc: { toFixed: () => "0.2500", valueOf: () => 0.25 },
      mktg_spend: null,
      status: "pending",
    });
    serviceDeps.getGapRecordById.mockResolvedValue({
      dq_id: 7,
      item_name: "Promo bucket",
      brand: "bk",
    });
    serviceDeps.getDimOfferAuditSnapshot.mockResolvedValue(null);

    await orchestration.approveGapSubmission(12, "user-2");

    expect(serviceDeps.createDimOffersAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        afterValues: expect.objectContaining({ discount_amount: "0.00" }),
      }),
    );
  });

  it("rejects a pending submission and reopens the gap", async () => {
    serviceDeps.getStagingRecordById.mockResolvedValue({
      id: 99,
      dq_id: 14,
      status: "pending",
    });

    await orchestration.rejectGapSubmission(99);

    expect(serviceDeps.updateDimOffersStagingStatus).toHaveBeenCalledWith(
      99,
      "rejected",
    );
    expect(serviceDeps.updateGapRecordStatus).toHaveBeenCalledWith(14, "open");
  });

  it("falls back to the stored gap record when transaction context is missing", async () => {
    serviceDeps.getGapRecordById.mockResolvedValue({
      dq_id: 4,
      trde_item: "JMO5600TDB",
      item_name: "Fallback item",
      brand: "jmo",
      item_category: "Offers JMO",
      missing_fields: "ideal_price,fc_perc",
      detected_at: new Date("2026-03-26T10:00:00.000Z"),
      status: "open",
    });
    serviceDeps.getTransactionItemContext.mockResolvedValue(null);
    serviceDeps.getCurrentDimOfferValues.mockResolvedValue({
      channel: null,
      category: null,
      subcategory: null,
      ideal_price: null,
      selling_price: null,
      fc_perc: null,
      fc_eur: null,
      mktg_spend: null,
    });

    serviceDeps.getBrandPricingTargetByAlias.mockResolvedValueOnce({
      brand_id: 3,
      brand_name: "Jimmy's",
      ideal_fc_perc: 0.28,
    });

    const gap = await orchestration.getGapFormData(4);

    expect(gap).toMatchObject({
      dq_id: 4,
      trde_item: "JMO5600TDB",
      item_name: "Fallback item",
      brand: "JMO",
      item_category: "Offers JMO",
      status: "open",
      missing_fields: ["ideal_price", "fc_perc"],
      brand_target: { brand_id: 3, brand_name: "Jimmy's", ideal_fc_perc: 0.28 },
    });
    expect(serviceDeps.getBrandPricingTargetByAlias).toHaveBeenCalledWith(
      "jmo",
    );
  });

  it("reads the gap queue from the snapshot with normalised options", async () => {
    const page = buildPage([
      {
        dq_id: 8,
        trde_item: "ITM-8",
        item_name: "Fresh item",
        brand: "BK",
        item_category: "Offers BK",
        detected_at: "2026-09-24T00:00:00.000Z",
        status: "open",
        missing_fields: ["ideal_price"],
      },
    ]);
    serviceDeps.queryGapQueuePage.mockResolvedValue(page);

    const queue = await orchestration.getOpenGapList(2, 25, {
      brandAliases: [" BK ", "kfc"],
      sortBy: "detected_at",
      sortDir: "desc",
      statuses: ["submitted"],
    });

    expect(queue).toBe(page);
    expect(serviceDeps.queryGapQueuePage).toHaveBeenCalledWith({
      brandAliases: ["bk", "kfc"],
      statuses: ["submitted"],
      sortBy: "detected_at",
      sortDir: "desc",
      page: 2,
      pageSize: 25,
    });
    expect(
      serviceDeps.tryRebuildGapQueueSnapshotExclusively,
    ).not.toHaveBeenCalled();
  });

  it("trims search terms, drops empty ones and keys the cache on them", async () => {
    serviceDeps.queryGapQueuePage.mockResolvedValue(buildPage());

    await orchestration.getOpenGapList(1, 50, {
      itemName: "  burger ",
      itemCode: "   ",
    });

    expect(serviceDeps.queryGapQueuePage).toHaveBeenLastCalledWith(
      expect.objectContaining({ itemName: "burger", itemCode: undefined }),
    );

    await orchestration.getOpenGapList(1, 50, { itemName: "burger" });

    expect(serviceDeps.queryGapQueuePage).toHaveBeenCalledTimes(1);

    await orchestration.getOpenGapList(1, 50, { itemName: "pizza" });

    expect(serviceDeps.queryGapQueuePage).toHaveBeenCalledTimes(2);
  });

  it("falls back to the default sort when the requested field is unknown", async () => {
    serviceDeps.queryGapQueuePage.mockResolvedValue(buildPage());

    await orchestration.getOpenGapList(1, 50, {
      sortBy: "nope" as never,
      sortDir: "sideways" as never,
    });

    expect(serviceDeps.queryGapQueuePage).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: "brand", sortDir: "asc" }),
    );
  });

  it("serves repeated identical requests from the cache until it is invalidated", async () => {
    serviceDeps.queryGapQueuePage.mockResolvedValue(buildPage());

    await orchestration.getOpenGapList(1, 50, { brandAliases: ["bk"] });
    await orchestration.getOpenGapList(1, 50, { brandAliases: ["bk"] });

    expect(serviceDeps.queryGapQueuePage).toHaveBeenCalledTimes(1);

    await orchestration.getOpenGapList(1, 50, { brandAliases: ["kfc"] });

    expect(serviceDeps.queryGapQueuePage).toHaveBeenCalledTimes(2);

    cache.invalidateGapQueueCache();
    await orchestration.getOpenGapList(1, 50, { brandAliases: ["bk"] });

    expect(serviceDeps.queryGapQueuePage).toHaveBeenCalledTimes(3);
  });

  it("builds the snapshot on first use when it has never been rebuilt", async () => {
    serviceDeps.getLatestSuccessfulSnapshotRefresh.mockResolvedValue(null);
    serviceDeps.tryRebuildGapQueueSnapshotExclusively.mockResolvedValue({
      status: "ran",
      summary: {},
    });
    serviceDeps.queryGapQueuePage.mockResolvedValue(buildPage());

    await orchestration.getOpenGapList();
    await orchestration.getOpenGapList(2);

    expect(
      serviceDeps.tryRebuildGapQueueSnapshotExclusively,
    ).toHaveBeenCalledTimes(1);
    expect(
      serviceDeps.tryRebuildGapQueueSnapshotExclusively,
    ).toHaveBeenCalledWith("cold_start");
  });

  it("resolves an item link through the snapshot without touching ClickHouse", async () => {
    serviceDeps.getSnapshotRowByItemCode.mockResolvedValue({
      trde_item: "ITM-7",
      dq_id: 7,
    });
    serviceDeps.getGapRecordById.mockResolvedValue({
      dq_id: 7,
      status: "open",
    });

    const gap = await orchestration.ensureGapRecordForItemCode("ITM-7");

    expect(gap).toMatchObject({ dq_id: 7 });
    expect(serviceDeps.getOfferEligibleItemCodes).not.toHaveBeenCalled();
    expect(serviceDeps.getTransactionItemContext).not.toHaveBeenCalled();
  });

  it("creates a gap on demand for an eligible unpriced item missing from the snapshot", async () => {
    serviceDeps.getSnapshotRowByItemCode.mockResolvedValue(null);
    serviceDeps.getGapRecordByItemCode.mockResolvedValue(null);
    serviceDeps.getTransactionItemContext.mockResolvedValue({
      trde_item: "ITM-NEW",
      item_name: "Brand new offer",
      brand: "kfc",
      item_category: "Offers KFC",
    });
    serviceDeps.getCurrentDimOfferValues.mockResolvedValue({
      channel: null,
      category: null,
      subcategory: null,
      ideal_price: null,
      selling_price: null,
      fc_perc: null,
      fc_eur: null,
      mktg_spend: null,
    });
    serviceDeps.createGapRecord.mockImplementation(async (data: object) => ({
      dq_id: 99,
      detected_at: new Date("2026-09-25T00:00:00.000Z"),
      status: "open",
      ...data,
    }));

    const gap = await orchestration.ensureGapRecordForItemCode("ITM-NEW");

    expect(gap).toMatchObject({ dq_id: 99, trde_item: "ITM-NEW" });
    expect(serviceDeps.createGapRecord).toHaveBeenCalledWith({
      trde_item: "ITM-NEW",
      item_name: "Brand new offer",
      brand: "kfc",
      item_category: "Offers KFC",
      missing_fields: "ideal_price,selling_price,fc_perc,fc_eur",
    });
    expect(serviceDeps.upsertSnapshotRow).toHaveBeenCalledWith(
      expect.objectContaining({
        trde_item: "ITM-NEW",
        dq_id: 99,
        status: "open",
        source: "on_demand",
      }),
    );
  });

  it("returns null for an item that is priced or not an offer", async () => {
    serviceDeps.getSnapshotRowByItemCode.mockResolvedValue(null);
    serviceDeps.getGapRecordByItemCode.mockResolvedValue(null);
    serviceDeps.getTransactionItemContext.mockResolvedValue(null);
    serviceDeps.getCurrentDimOfferValues.mockResolvedValue({
      channel: "Wolt",
      category: "Meals",
      subcategory: "Combo",
      ideal_price: 9.9,
      selling_price: 8.5,
      fc_perc: 0.3,
      fc_eur: 2.4,
      mktg_spend: null,
    });

    expect(
      await orchestration.ensureGapRecordForItemCode("ITM-PRICED"),
    ).toBeNull();
    expect(serviceDeps.createGapRecord).not.toHaveBeenCalled();
  });

  it("builds the pending submission queue with batched lookups", async () => {
    serviceDeps.listPendingStagingRecords.mockResolvedValue([
      {
        id: 1,
        dq_id: 7,
        item_code: "ITM-7",
        channel: "Wolt",
        category: "Meals",
        subcategory: "Combo",
        ideal_price: { toFixed: () => "9.90" },
        selling_price: { toFixed: () => "8.50" },
        fc_perc: { toFixed: () => "0.3000" },
        mktg_spend: null,
        notes: null,
        submitted_by: "user-1",
        submitted_at: new Date("2026-09-24T10:00:00.000Z"),
      },
      {
        id: 2,
        dq_id: 404,
        item_code: "ITM-ORPHAN",
        channel: "Wolt",
        category: "Meals",
        subcategory: "Combo",
        ideal_price: { toFixed: () => "1.00" },
        selling_price: { toFixed: () => "1.00" },
        fc_perc: { toFixed: () => "0.1000" },
        mktg_spend: null,
        notes: null,
        submitted_by: "user-1",
        submitted_at: new Date("2026-09-24T10:00:00.000Z"),
      },
    ]);
    serviceDeps.getGapRecordsByIds.mockResolvedValue([
      {
        dq_id: 7,
        trde_item: "ITM-7",
        item_name: "Stored name",
        brand: "kfc",
        item_category: "Offers KFC",
        missing_fields: "ideal_price",
        detected_at: new Date("2026-03-26T10:00:00.000Z"),
        status: "submitted",
      },
    ]);
    serviceDeps.getTransactionItemContexts.mockResolvedValue(
      new Map([
        [
          "ITM-7",
          {
            trde_item: "ITM-7",
            item_name: "Live name",
            brand: "kfc",
            item_category: "Offers KFC",
          },
        ],
      ]),
    );

    const queue = await orchestration.getPendingGapSubmissionQueue();

    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      id: 1,
      item_name: "Live name",
      brand: "KFC",
      missing_fields: ["ideal_price"],
    });
    expect(serviceDeps.getGapRecordsByIds).toHaveBeenCalledWith([7, 404]);
    expect(serviceDeps.getTransactionItemContexts).toHaveBeenCalledWith([
      "ITM-7",
      "ITM-ORPHAN",
    ]);
    expect(serviceDeps.getTransactionItemContext).not.toHaveBeenCalled();
  });
});

describe("dismissGaps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dismisses only open gaps of the user's brands", async () => {
    const rows = new Map([
      [1, { dq_id: 1, status: "open", brand_aliases: ["kfc"] }],
      [2, { dq_id: 2, status: "submitted", brand_aliases: ["kfc"] }],
      [3, { dq_id: 3, status: "open", brand_aliases: ["phc"] }],
    ]);
    serviceDeps.getSnapshotRowByGapId.mockImplementation(
      async (id: number) => rows.get(id) ?? null,
    );

    const result = await orchestration.dismissGaps(
      [1, 1, 2, 3, 4],
      [" KFC "],
      "user-1",
    );

    expect(result.processedIds).toEqual([1]);
    expect(result.failed.map((failure) => failure.id)).toEqual([2, 3, 4]);
    expect(serviceDeps.updateGapRecordStatus).toHaveBeenCalledTimes(1);
    expect(serviceDeps.updateGapRecordStatus).toHaveBeenCalledWith(
      1,
      "dismissed",
      "user-1",
    );
  });

  it("approves only submitted gaps of the user's brands", async () => {
    const rows = new Map([
      [
        1,
        {
          dq_id: 1,
          status: "submitted",
          brand_aliases: ["kfc"],
          trde_item: "A",
        },
      ],
      [2, { dq_id: 2, status: "open", brand_aliases: ["kfc"], trde_item: "B" }],
      [
        3,
        {
          dq_id: 3,
          status: "submitted",
          brand_aliases: ["phc"],
          trde_item: "C",
        },
      ],
      [
        5,
        {
          dq_id: 5,
          status: "submitted",
          brand_aliases: ["kfc"],
          trde_item: "E",
        },
      ],
    ]);
    const staging = {
      id: 42,
      dq_id: 1,
      item_code: "A",
      channel: "Wolt Only",
      category: "ONEPLUSX",
      subcategory: "% Disc",
      ideal_price: { toString: () => "8.5", toFixed: () => "8.50" },
      selling_price: { toString: () => "5.99", toFixed: () => "5.99" },
      fc_perc: { toFixed: () => "0.3200" },
      fc_eur: null,
      mktg_spend: null,
      status: "pending",
    };
    serviceDeps.getSnapshotRowByGapId.mockImplementation(
      async (id: number) => rows.get(id) ?? null,
    );
    // Gap 5 is submitted but its pending staging row belongs to another gap.
    serviceDeps.getPendingStagingRecordByItemCode.mockImplementation(
      async (itemCode: string) =>
        itemCode === "A"
          ? staging
          : itemCode === "E"
            ? { id: 43, dq_id: 99 }
            : null,
    );
    serviceDeps.getStagingRecordById.mockResolvedValue(staging);
    serviceDeps.getGapRecordById.mockResolvedValue({
      dq_id: 1,
      item_name: "Zinger",
      brand: "kfc",
    });
    serviceDeps.getDimOfferAuditSnapshot.mockResolvedValue(null);

    const result = await orchestration.approveGaps(
      [1, 1, 2, 3, 4, 5],
      [" KFC "],
      "user-1",
    );

    expect(result.processedIds).toEqual([1]);
    expect(result.failed.map((failure) => failure.id)).toEqual([2, 3, 4, 5]);
    expect(serviceDeps.updateDimOffersStagingStatus).toHaveBeenCalledTimes(1);
    expect(serviceDeps.updateDimOffersStagingStatus).toHaveBeenCalledWith(
      42,
      "approved",
      "user-1",
    );
    expect(serviceDeps.updateGapRecordStatus).toHaveBeenCalledWith(
      1,
      "resolved",
    );
  });

  it("does not revive a dismissed gap from an old open-form link", async () => {
    serviceDeps.getSnapshotRowByItemCode.mockResolvedValue(null);
    serviceDeps.getGapRecordByItemCode.mockResolvedValue({
      dq_id: 5,
      trde_item: "ITM-5",
      status: "dismissed",
    });

    await expect(
      orchestration.ensureGapRecordForItemCode("ITM-5"),
    ).resolves.toBeNull();
    expect(serviceDeps.upsertSnapshotRow).not.toHaveBeenCalled();
    expect(serviceDeps.createGapRecord).not.toHaveBeenCalled();
  });

  it("restores only dismissed gaps of the user's brands", async () => {
    serviceDeps.getGapRecordsByIds.mockResolvedValue([
      { dq_id: 1, status: "dismissed", brand: "KFC " },
      { dq_id: 2, status: "open", brand: "KFC" },
      { dq_id: 3, status: "dismissed", brand: "PHC" },
    ]);

    const result = await orchestration.restoreGaps([1, 2, 3, 4], ["kfc"]);

    expect(result.processedIds).toEqual([1]);
    expect(result.failed.map((failure) => failure.id)).toEqual([2, 3, 4]);
    expect(serviceDeps.updateGapRecordStatus).toHaveBeenCalledTimes(1);
    expect(serviceDeps.updateGapRecordStatus).toHaveBeenCalledWith(1, "open");
  });
});
