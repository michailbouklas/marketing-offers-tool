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
  listGapRecords: vi.fn(),
  listRecentlyResolvedItemCodes: vi.fn(),
  updateDimOffersStagingStatus: vi.fn(),
  updateGapRecordStatus: vi.fn(),
}));

const clickhouseDeps = await import("./offers-data-quality-clickhouse.server");
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
      missing_fields: "ideal_price,selling_price,fc_perc",
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
