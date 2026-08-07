import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/auth-guards", () => ({
  requireApiPermission: vi.fn(),
}));

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    brand: { findUnique: vi.fn() },
  },
}));

vi.mock("$lib/services/brand-entities.server", () => ({
  assignEntitiesToBrand: vi.fn(),
  listBrandAssignments: vi.fn(),
  unassignEntities: vi.fn(),
}));

const authModule = await import("$lib/server/auth-guards");
const prismaModule = await import("$lib/server/prisma");
const serviceModule = await import("$lib/services/brand-entities.server");
const { POST } = await import("./+server");

const requirePermissionMock =
  authModule.requireApiPermission as unknown as ReturnType<typeof vi.fn>;
const brandFindUniqueMock = (
  prismaModule.prisma as unknown as {
    brand: { findUnique: ReturnType<typeof vi.fn> };
  }
).brand.findUnique;
const assignMock = serviceModule.assignEntitiesToBrand as unknown as ReturnType<
  typeof vi.fn
>;

function makeEvent(body: unknown) {
  return {
    request: { json: async () => body },
    url: new URL("http://test.local/api/admin/brand-entities"),
  } as unknown as Parameters<typeof POST>[0];
}

/**
 * Captures the status of the `error()` thrown by a handler. Takes `unknown`
 * because a SvelteKit handler is typed `MaybePromise<Response>`.
 */
async function statusOf(result: unknown): Promise<number> {
  try {
    await result;
  } catch (err) {
    return (err as { status: number }).status;
  }

  throw new Error("expected the handler to throw");
}

beforeEach(() => {
  vi.clearAllMocks();
  requirePermissionMock.mockResolvedValue({
    session: {},
    user: { id: "user-1" },
  });
  brandFindUniqueMock.mockResolvedValue({ id: 7 });
  assignMock.mockResolvedValue(2);
});

describe("POST /api/admin/brand-entities", () => {
  it("assigns aggregator stores and records who did it", async () => {
    const response = await POST(
      makeEvent({
        brandId: 7,
        entityType: "aggregatorStore",
        entityIds: ["FOODY:FY_CY;493", "WOLT:kfc-paphos"],
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ count: 2 });
    expect(assignMock).toHaveBeenCalledWith({
      brandId: 7,
      entityType: "aggregatorStore",
      entityIds: ["FOODY:FY_CY;493", "WOLT:kfc-paphos"],
      createdBy: "user-1",
    });
  });

  it("rejects an entityId that is not a valid store key", async () => {
    // `bolt` is a real aggregator for offers but is never scraped for KPIs.
    const status = await statusOf(
      POST(
        makeEvent({
          brandId: 7,
          entityType: "aggregatorStore",
          entityIds: ["BOLT:whatever"],
        }),
      ),
    );

    expect(status).toBe(400);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown entityType", async () => {
    const status = await statusOf(
      POST(
        makeEvent({
          brandId: 7,
          entityType: "somethingElse",
          entityIds: ["x"],
        }),
      ),
    );

    expect(status).toBe(400);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("404s when the brand does not exist", async () => {
    brandFindUniqueMock.mockResolvedValue(null);

    const status = await statusOf(
      POST(
        makeEvent({
          brandId: 999,
          entityType: "aggregatorStore",
          entityIds: ["FOODY:FY_CY;493"],
        }),
      ),
    );

    expect(status).toBe(404);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("does not assign when the permission guard rejects", async () => {
    requirePermissionMock.mockRejectedValue(
      Object.assign(new Error("Forbidden"), { status: 403 }),
    );

    const status = await statusOf(
      POST(
        makeEvent({
          brandId: 7,
          entityType: "aggregatorStore",
          entityIds: ["FOODY:FY_CY;493"],
        }),
      ),
    );

    expect(status).toBe(403);
    expect(assignMock).not.toHaveBeenCalled();
  });
});
