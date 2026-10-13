import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/auth-guards", () => ({
  requireAuthenticatedUser: vi.fn(),
}));

vi.mock("$lib/services/offers-data-quality.server", () => ({
  getGapFormData: vi.fn(),
}));

vi.mock("$lib/services/offers-data-quality-postgres.server", () => ({
  createDimOffersStagingRecord: vi.fn(),
  getGapRecordById: vi.fn(),
  getPendingStagingRecordByGapId: vi.fn(),
  updateGapRecordStatus: vi.fn(),
  validateCategorySubcategoryPair: vi.fn(),
}));

vi.mock("$lib/services/brands.server", () => ({
  getBrandPricingTargetByAlias: vi.fn(),
}));

const authModule = await import("$lib/server/auth-guards");
const postgresModule =
  await import("$lib/services/offers-data-quality-postgres.server");
const brandsModule = await import("$lib/services/brands.server");
const { POST } = await import("./+server");

const requireUserMock =
  authModule.requireAuthenticatedUser as unknown as ReturnType<typeof vi.fn>;
const postgresMocks = {
  createDimOffersStagingRecord:
    postgresModule.createDimOffersStagingRecord as unknown as ReturnType<
      typeof vi.fn
    >,
  getGapRecordById: postgresModule.getGapRecordById as unknown as ReturnType<
    typeof vi.fn
  >,
  getPendingStagingRecordByGapId:
    postgresModule.getPendingStagingRecordByGapId as unknown as ReturnType<
      typeof vi.fn
    >,
  updateGapRecordStatus:
    postgresModule.updateGapRecordStatus as unknown as ReturnType<typeof vi.fn>,
  validateCategorySubcategoryPair:
    postgresModule.validateCategorySubcategoryPair as unknown as ReturnType<
      typeof vi.fn
    >,
};
const brandTargetMock =
  brandsModule.getBrandPricingTargetByAlias as unknown as ReturnType<
    typeof vi.fn
  >;

const validPayload = {
  channel: "Wolt Only",
  category: "ONEPLUSX",
  subcategory: "% Disc",
  fc_eur: 3,
  selling_price: 9,
  fc_perc: 0.3,
  mktg_spend: null,
  notes: "from pricing sheet",
};

function makeEvent(body: unknown, id = "9") {
  return {
    params: { id },
    request: new Request(`http://localhost/api/gaps/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  requireUserMock.mockReturnValue({ user: { id: "user-1" }, session: {} });
  postgresMocks.getGapRecordById.mockResolvedValue({
    dq_id: 9,
    trde_item: "ITM-9",
    brand: "kfc",
    status: "open",
  });
  postgresMocks.getPendingStagingRecordByGapId.mockResolvedValue(null);
  postgresMocks.validateCategorySubcategoryPair.mockResolvedValue(true);
  postgresMocks.createDimOffersStagingRecord.mockResolvedValue({
    id: 77,
    submitted_at: new Date("2026-10-13T08:00:00.000Z"),
  });
  brandTargetMock.mockResolvedValue({
    brand_id: 1,
    brand_name: "KFC",
    ideal_fc_perc: 0.3,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/gaps/[id]", () => {
  it("derives ideal price from fc_eur and the brand target and stages it", async () => {
    const response = await POST(makeEvent(validPayload));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      staging_id: 77,
      status: "pending",
      submitted_at: "2026-10-13T08:00:00.000Z",
    });
    expect(brandTargetMock).toHaveBeenCalledWith("kfc");
    expect(postgresMocks.createDimOffersStagingRecord).toHaveBeenCalledWith({
      dq_id: 9,
      item_code: "ITM-9",
      channel: "Wolt Only",
      category: "ONEPLUSX",
      subcategory: "% Disc",
      // (3 / 0.30) x 1.05 x 1.07 = 11.235 -> 11.24
      ideal_price: "11.24",
      selling_price: "9.00",
      fc_perc: "0.3000",
      fc_eur: "3.00",
      brand_ideal_fc_perc: "0.3000",
      mktg_spend: null,
      notes: "from pricing sheet",
      submitted_by: "user-1",
    });
    expect(postgresMocks.updateGapRecordStatus).toHaveBeenCalledWith(
      9,
      "submitted",
    );
  });

  it("ignores any ideal_price sent by the client", async () => {
    const response = await POST(
      makeEvent({ ...validPayload, ideal_price: 999 }),
    );

    expect(response.status).toBe(201);
    expect(postgresMocks.createDimOffersStagingRecord).toHaveBeenCalledWith(
      expect.objectContaining({ ideal_price: "11.24" }),
    );
  });

  it("rejects the submission when the brand has no target", async () => {
    brandTargetMock.mockResolvedValue({
      brand_id: 1,
      brand_name: "KFC",
      ideal_fc_perc: null,
    });

    const response = await POST(makeEvent(validPayload));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      errors: {
        brand_ideal_fc_perc: expect.stringContaining("KFC"),
      },
    });
    expect(postgresMocks.createDimOffersStagingRecord).not.toHaveBeenCalled();
    expect(postgresMocks.updateGapRecordStatus).not.toHaveBeenCalled();
  });

  it("rejects the submission when no brand matches the gap's alias", async () => {
    brandTargetMock.mockResolvedValue(null);

    const response = await POST(makeEvent(validPayload));

    expect(response.status).toBe(400);
    expect(postgresMocks.createDimOffersStagingRecord).not.toHaveBeenCalled();
  });

  it("rejects a selling price above the derived ideal price", async () => {
    const response = await POST(
      makeEvent({ ...validPayload, selling_price: 11.25 }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      errors: { selling_price: "Selling price cannot exceed ideal price" },
    });
    expect(postgresMocks.createDimOffersStagingRecord).not.toHaveBeenCalled();
  });

  it("requires a positive fc_eur", async () => {
    const response = await POST(makeEvent({ ...validPayload, fc_eur: 0 }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      errors: expect.objectContaining({ fc_eur: expect.any(String) }),
    });
    expect(brandTargetMock).not.toHaveBeenCalled();
  });
});
