import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/prisma", () => ({
  prisma: { brand: { findUnique: vi.fn() } },
}));
vi.mock("$lib/server/google-reviews-prisma", () => ({
  googleReviewsPrisma: { businesses: { findMany: vi.fn() } },
}));
vi.mock("$lib/services/brand-entities.server", () => ({
  assignEntitiesToBrand: vi.fn(),
  getBrandRefsByEntityIds: vi.fn(),
}));
vi.mock("./places.server", () => ({
  listScrapeQueriesPage: vi.fn(),
}));

const { prisma } = await import("$lib/server/prisma");
const { googleReviewsPrisma } =
  await import("$lib/server/google-reviews-prisma");
const entities = await import("$lib/services/brand-entities.server");
const places = await import("./places.server");
const {
  formatPlaceBrandSyncMessage,
  formatPlaceBrandSyncTotals,
  propagateAllPlaceBrands,
  propagatePlaceBrand,
} = await import("./place-brand-sync.server");

const findBrand = vi.mocked(prisma.brand.findUnique);
const findBusinesses = vi.mocked(googleReviewsPrisma.businesses.findMany);
const assign = vi.mocked(entities.assignEntitiesToBrand);
const refs = vi.mocked(entities.getBrandRefsByEntityIds);
const listPage = vi.mocked(places.listScrapeQueriesPage);

const appBrands: Record<number, { id: number; name: string }> = {
  30: { id: 20, name: "Verde" },
  28: { id: 18, name: "Tavernaki" },
};

beforeEach(() => {
  vi.clearAllMocks();
  findBrand.mockImplementation(
    (async (args: { where: { google_places_brand_id?: number } }) =>
      appBrands[args.where.google_places_brand_id ?? -1] ?? null) as never,
  );
  assign.mockImplementation(async (input) => input.entityIds.length);
});

describe("propagatePlaceBrand", () => {
  it("does nothing when the place has no brand", async () => {
    const result = await propagatePlaceBrand({
      placeId: 24,
      remoteBrandId: null,
    });

    expect(result).toMatchObject({ brandId: null, assigned: 0, discovered: 0 });
    expect(findBusinesses).not.toHaveBeenCalled();
    expect(formatPlaceBrandSyncMessage(result)).toBe("");
  });

  it("reports an unmapped scraper brand without assigning", async () => {
    const result = await propagatePlaceBrand({
      placeId: 24,
      remoteBrandId: 99,
    });

    expect(result.unmappedBrand).toBe(true);
    expect(assign).not.toHaveBeenCalled();
    expect(formatPlaceBrandSyncMessage(result)).toMatch(
      /scraper brand #99 is not linked/,
    );
  });

  it("assigns unassigned and previous-brand businesses, skips other brands", async () => {
    findBusinesses.mockResolvedValue([
      { cid: "a" },
      { cid: "b" },
      { cid: "c" },
      { cid: "d" },
      { cid: "a" },
    ] as never);
    refs.mockResolvedValue(
      new Map([
        ["b", { brandId: 20, brandName: "Verde" }],
        ["c", { brandId: 18, brandName: "Tavernaki" }],
        ["d", { brandId: 2, brandName: "Burger King" }],
      ]),
    );

    const result = await propagatePlaceBrand({
      placeId: 24,
      remoteBrandId: 30,
      previousRemoteBrandId: 28,
      actorUserId: "user-1",
    });

    expect(findBusinesses).toHaveBeenCalledWith({
      where: { input_id: "24" },
      select: { cid: true },
    });
    expect(assign).toHaveBeenCalledWith({
      brandId: 20,
      entityType: "googleReviewsBusiness",
      entityIds: ["a", "c"],
      createdBy: "user-1",
    });
    expect(result).toMatchObject({
      brandId: 20,
      brandName: "Verde",
      discovered: 4,
      assigned: 2,
      alreadyAssigned: 1,
      skippedConflicts: 1,
    });
    expect(formatPlaceBrandSyncMessage(result)).toBe(
      "Linked 2 businesses to Verde (1 already linked, 1 skipped: assigned to another brand).",
    );
  });

  it("does not treat the previous brand as movable when it equals the new one", async () => {
    findBusinesses.mockResolvedValue([{ cid: "x" }] as never);
    refs.mockResolvedValue(new Map([["x", { brandId: 2, brandName: "BK" }]]));

    const result = await propagatePlaceBrand({
      placeId: 24,
      remoteBrandId: 30,
      previousRemoteBrandId: 30,
    });

    expect(assign).not.toHaveBeenCalled();
    expect(result.skippedConflicts).toBe(1);
  });

  it("explains when nothing has been discovered yet", async () => {
    findBusinesses.mockResolvedValue([] as never);

    const result = await propagatePlaceBrand({
      placeId: 30,
      remoteBrandId: 30,
    });

    expect(result.discovered).toBe(0);
    expect(formatPlaceBrandSyncMessage(result)).toMatch(
      /after the next scrape/,
    );
  });
});

describe("propagateAllPlaceBrands", () => {
  it("pages through places with a brand and aggregates", async () => {
    listPage
      .mockResolvedValueOnce({
        items: [
          { id: 1, brandId: null },
          { id: 24, brandId: 30 },
        ],
        page: 1,
        pageSize: 100,
        totalItems: 3,
        totalPages: 2,
      } as never)
      .mockResolvedValueOnce({
        items: [{ id: 31, brandId: 28 }],
        page: 2,
        pageSize: 100,
        totalItems: 3,
        totalPages: 2,
      } as never);
    findBusinesses.mockImplementation((async (args: {
      where: { input_id: string };
    }) =>
      args.where.input_id === "24"
        ? [{ cid: "v1" }, { cid: "v2" }]
        : [{ cid: "t1" }]) as never);
    refs.mockResolvedValue(
      new Map([["v2", { brandId: 20, brandName: "Verde" }]]),
    );

    const { totals, results } = await propagateAllPlaceBrands("user-1");

    expect(listPage).toHaveBeenCalledTimes(2);
    expect(results.map((r) => r.placeId)).toEqual([24, 31]);
    expect(totals).toEqual({
      places: 2,
      unmappedPlaces: 0,
      discovered: 3,
      assigned: 2,
      alreadyAssigned: 1,
      skippedConflicts: 0,
    });
    expect(formatPlaceBrandSyncTotals(totals)).toBe(
      "Synced 2 places: linked 2 businesses (1 already linked).",
    );
  });
});
