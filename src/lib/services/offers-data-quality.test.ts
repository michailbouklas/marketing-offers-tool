import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("./offers-data-quality-clickhouse.server", () => ({
  getCurrentDimOfferValues: vi.fn(),
  getDimOfferAuditSnapshot: vi.fn(),
  getOfferEligibleItemCodes: vi.fn(),
  getTransactionItemContext: vi.fn(),
  insertDimOffer: vi.fn(),
  listMissingOfferQueueRows: vi.fn(),
  updateDimOffer: vi.fn(),
}));

vi.mock("./dim-offers-audit.server", () => ({
  createDimOffersAuditRecord: vi.fn(),
}));

vi.mock("./offers-data-quality-postgres.server", () => ({
  createGapRecord: vi.fn(),
  getGapRecordById: vi.fn(),
  getGapRecordByItemCode: vi.fn(),
  getPendingStagingRecordByItemCode: vi.fn(),
  getStagingRecordById: vi.fn(),
  listPendingStagingRecords: vi.fn(),
  listGapRecords: vi.fn(),
  updateDimOffersStagingStatus: vi.fn(),
  updateGapRecordStatus: vi.fn(),
}));

const clickhouseDeps = await import("./offers-data-quality-clickhouse.server");
const auditDeps = await import("./dim-offers-audit.server");
const postgresDeps = await import("./offers-data-quality-postgres.server");
const helpers = await import("./offers-data-quality");
const orchestration = await import("./offers-data-quality.server");

const serviceDeps = {
  getCurrentDimOfferValues: clickhouseDeps.getCurrentDimOfferValues as Mock,
  getDimOfferAuditSnapshot: clickhouseDeps.getDimOfferAuditSnapshot as Mock,
  getOfferEligibleItemCodes: clickhouseDeps.getOfferEligibleItemCodes as Mock,
  getTransactionItemContext: clickhouseDeps.getTransactionItemContext as Mock,
  insertDimOffer: clickhouseDeps.insertDimOffer as Mock,
  listMissingOfferQueueRows: clickhouseDeps.listMissingOfferQueueRows as Mock,
  updateDimOffer: clickhouseDeps.updateDimOffer as Mock,
  createDimOffersAuditRecord: auditDeps.createDimOffersAuditRecord as Mock,
  getGapRecordById: postgresDeps.getGapRecordById as Mock,
  getPendingStagingRecordByItemCode:
    postgresDeps.getPendingStagingRecordByItemCode as Mock,
  getStagingRecordById: postgresDeps.getStagingRecordById as Mock,
  listGapRecords: postgresDeps.listGapRecords as Mock,
  updateDimOffersStagingStatus:
    postgresDeps.updateDimOffersStagingStatus as Mock,
  updateGapRecordStatus: postgresDeps.updateGapRecordStatus as Mock,
};

describe("offers-data-quality helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      missing_fields: ["ideal_price", "fc_perc"],
      current_dim_offers: {
        channel: "Wolt Only",
        category: "ONEPLUSX",
        subcategory: "% Disc",
        ideal_price: 0,
        selling_price: 5.99,
        fc_perc: 0,
        mktg_spend: null,
      },
    });

    expect(form).toEqual({
      channel: "Wolt Only",
      category: "ONEPLUSX",
      subcategory: "% Disc",
      ideal_price: "",
      selling_price: "5.99",
      fc_perc: "",
      mktg_spend: "",
      notes: "",
    });
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
      mktg_spend: "1.25",
      notes: "hello",
    });

    expect(payload).toEqual({
      channel: "Wolt Only",
      category: "ONEPLUSX",
      subcategory: "% Disc",
      ideal_price: 8.5,
      selling_price: 0,
      fc_perc: 0.32,
      mktg_spend: 1.25,
      notes: "hello",
    });
  });

  it("normalizes numeric values in the client form schema before cross-field validation", () => {
    const result = helpers.gapPricingFormSchema.safeParse({
      channel: "Wolt Only",
      category: "ONEPLUSX",
      subcategory: "% Disc",
      ideal_price: 50,
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
      ideal_price: "50",
      selling_price: "45",
      fc_perc: "20",
      mktg_spend: "30",
    });
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

describe("offers-data-quality orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceDeps.getOfferEligibleItemCodes.mockImplementation(
      async (itemCodes: string[]) => new Set(itemCodes),
    );
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

  it("builds the queue from ClickHouse rows and PostgreSQL statuses", async () => {
    serviceDeps.listGapRecords.mockResolvedValue([
      {
        dq_id: 7,
        trde_item: "ITM-7",
        item_name: "Tracked item",
        brand: "kfc",
        item_category: "Offers KFC",
        missing_fields: "ideal_price,fc_perc",
        detected_at: new Date("2026-03-26T10:00:00.000Z"),
        status: "submitted",
      },
    ]);
    serviceDeps.listMissingOfferQueueRows.mockResolvedValue([
      {
        trde_item: "ITM-7",
        item_name: "Tracked item",
        brand: "kfc",
        item_category: "Offers KFC",
        current_dim_offers: {
          channel: null,
          category: null,
          subcategory: null,
          ideal_price: 0,
          selling_price: 5.99,
          fc_perc: 0,
          mktg_spend: null,
        },
      },
      {
        trde_item: "ITM-8",
        item_name: "Fresh item",
        brand: "bk",
        item_category: "Offers BK",
        current_dim_offers: {
          channel: null,
          category: null,
          subcategory: null,
          ideal_price: null,
          selling_price: null,
          fc_perc: null,
          mktg_spend: null,
        },
      },
    ]);

    const queue = await orchestration.getOpenGapList();

    expect(queue.items).toHaveLength(2);
    expect(
      queue.items.find((item) => item.trde_item === "ITM-7"),
    ).toMatchObject({
      dq_id: 7,
      status: "submitted",
      missing_fields: ["ideal_price", "fc_perc"],
    });
    expect(
      queue.items.find((item) => item.trde_item === "ITM-8"),
    ).toMatchObject({
      dq_id: 0,
      status: "open",
      missing_fields: ["ideal_price", "selling_price", "fc_perc"],
    });
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
      mktg_spend: null,
    });

    const gap = await orchestration.getGapFormData(4);

    expect(gap).toMatchObject({
      dq_id: 4,
      trde_item: "JMO5600TDB",
      item_name: "Fallback item",
      brand: "JMO",
      item_category: "Offers JMO",
      missing_fields: ["ideal_price", "fc_perc"],
    });
  });

  it("filters the queue by assigned brand aliases when provided", async () => {
    serviceDeps.listGapRecords.mockResolvedValue([
      {
        dq_id: 7,
        trde_item: "ITM-7",
        item_name: "Tracked item",
        brand: "kfc",
        item_category: "Offers KFC",
        missing_fields: "ideal_price,fc_perc",
        detected_at: new Date("2026-03-26T10:00:00.000Z"),
        status: "submitted",
      },
    ]);
    const allClickhouseRows = [
      {
        trde_item: "ITM-7",
        item_name: "Tracked item",
        brand: "kfc",
        item_category: "Offers KFC",
        current_dim_offers: {
          channel: null,
          category: null,
          subcategory: null,
          ideal_price: 0,
          selling_price: 5.99,
          fc_perc: 0,
          mktg_spend: null,
        },
      },
      {
        trde_item: "ITM-8",
        item_name: "Fresh item",
        brand: "bk",
        item_category: "Offers BK",
        current_dim_offers: {
          channel: null,
          category: null,
          subcategory: null,
          ideal_price: null,
          selling_price: null,
          fc_perc: null,
          mktg_spend: null,
        },
      },
    ];
    serviceDeps.listMissingOfferQueueRows.mockImplementation(
      async (callOptions?: { brandAliases?: string[] }) => {
        if (!callOptions?.brandAliases) return allClickhouseRows;
        const allowed = new Set(
          callOptions.brandAliases.map((value) => value.trim().toLowerCase()),
        );

        return allClickhouseRows.filter((row) =>
          allowed.has(row.brand.trim().toLowerCase()),
        );
      },
    );

    const queue = await orchestration.getOpenGapList(1, 50, {
      brandAliases: ["bk"],
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]).toMatchObject({
      trde_item: "ITM-8",
      brand: "BK",
      status: "open",
    });
  });

  it("sorts the queue by brand before applying secondary ordering", async () => {
    serviceDeps.listGapRecords.mockResolvedValue([
      {
        dq_id: 7,
        trde_item: "ITM-7",
        item_name: "Tracked item",
        brand: "kfc",
        item_category: "Offers KFC",
        missing_fields: "ideal_price,fc_perc",
        detected_at: new Date("2026-03-26T10:00:00.000Z"),
        status: "submitted",
      },
      {
        dq_id: 8,
        trde_item: "ITM-8",
        item_name: "Later BK item",
        brand: "bk",
        item_category: "Offers BK",
        missing_fields: "ideal_price,fc_perc",
        detected_at: new Date("2026-03-27T10:00:00.000Z"),
        status: "submitted",
      },
    ]);
    serviceDeps.listMissingOfferQueueRows.mockResolvedValue([
      {
        trde_item: "ITM-7",
        item_name: "Tracked item",
        brand: "kfc",
        item_category: "Offers KFC",
        current_dim_offers: {
          channel: null,
          category: null,
          subcategory: null,
          ideal_price: 0,
          selling_price: 5.99,
          fc_perc: 0,
          mktg_spend: null,
        },
      },
      {
        trde_item: "ITM-8",
        item_name: "Later BK item",
        brand: "bk",
        item_category: "Offers BK",
        current_dim_offers: {
          channel: null,
          category: null,
          subcategory: null,
          ideal_price: 0,
          selling_price: 6.99,
          fc_perc: 0,
          mktg_spend: null,
        },
      },
    ]);

    const queue = await orchestration.getOpenGapList();

    expect(queue.items.map((item) => item.brand)).toEqual(["BK", "KFC"]);
    expect(queue.items.map((item) => item.trde_item)).toEqual([
      "ITM-8",
      "ITM-7",
    ]);
  });

  it("sorts the queue by detected timestamp when requested from the header state", async () => {
    serviceDeps.listGapRecords.mockResolvedValue([
      {
        dq_id: 7,
        trde_item: "ITM-7",
        item_name: "Tracked item",
        brand: "kfc",
        item_category: "Offers KFC",
        missing_fields: "ideal_price,fc_perc",
        detected_at: new Date("2026-03-26T10:00:00.000Z"),
        status: "submitted",
      },
      {
        dq_id: 8,
        trde_item: "ITM-8",
        item_name: "Later BK item",
        brand: "bk",
        item_category: "Offers BK",
        missing_fields: "ideal_price,fc_perc",
        detected_at: new Date("2026-03-27T10:00:00.000Z"),
        status: "submitted",
      },
    ]);
    serviceDeps.listMissingOfferQueueRows.mockResolvedValue([
      {
        trde_item: "ITM-7",
        item_name: "Tracked item",
        brand: "kfc",
        item_category: "Offers KFC",
        current_dim_offers: {
          channel: null,
          category: null,
          subcategory: null,
          ideal_price: 0,
          selling_price: 5.99,
          fc_perc: 0,
          mktg_spend: null,
        },
      },
      {
        trde_item: "ITM-8",
        item_name: "Later BK item",
        brand: "bk",
        item_category: "Offers BK",
        current_dim_offers: {
          channel: null,
          category: null,
          subcategory: null,
          ideal_price: 0,
          selling_price: 6.99,
          fc_perc: 0,
          mktg_spend: null,
        },
      },
    ]);

    const queue = await orchestration.getOpenGapList(1, 50, {
      sortBy: "detected_at",
      sortDir: "desc",
    });

    expect(queue.items.map((item) => item.trde_item)).toEqual([
      "ITM-8",
      "ITM-7",
    ]);
  });

  it("hides a tracked-only gap when its item no longer qualifies as an offer in dim_items", async () => {
    serviceDeps.listGapRecords.mockResolvedValue([
      {
        dq_id: 21,
        trde_item: "ITM-RECATEGORIZED",
        item_name: "Item moved out of offer category",
        brand: "kfc",
        item_category: "Offers KFC",
        missing_fields: "ideal_price,fc_perc",
        detected_at: new Date("2026-03-26T10:00:00.000Z"),
        status: "open",
      },
    ]);
    serviceDeps.listMissingOfferQueueRows.mockResolvedValue([]);
    serviceDeps.getOfferEligibleItemCodes.mockResolvedValue(new Set());

    const queue = await orchestration.getOpenGapList();

    expect(queue.items).toEqual([]);
    expect(queue.totalItems).toBe(0);
    expect(serviceDeps.getOfferEligibleItemCodes).toHaveBeenCalledWith([
      "ITM-RECATEGORIZED",
    ]);
  });

  it("keeps a tracked-only gap visible when its item is still an active offer in dim_items", async () => {
    serviceDeps.listGapRecords.mockResolvedValue([
      {
        dq_id: 31,
        trde_item: "ITM-ACTIVE",
        item_name: "Quiet active item",
        brand: "kfc",
        item_category: "Offers KFC",
        missing_fields: "ideal_price,selling_price",
        detected_at: new Date("2026-03-26T10:00:00.000Z"),
        status: "submitted",
      },
    ]);
    serviceDeps.listMissingOfferQueueRows.mockResolvedValue([]);
    serviceDeps.getOfferEligibleItemCodes.mockResolvedValue(
      new Set(["ITM-ACTIVE"]),
    );

    const queue = await orchestration.getOpenGapList();

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]).toMatchObject({
      dq_id: 31,
      trde_item: "ITM-ACTIVE",
      status: "submitted",
      missing_fields: ["ideal_price", "selling_price"],
    });
  });
});
