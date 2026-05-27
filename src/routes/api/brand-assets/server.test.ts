import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    user_brand: { findUnique: vi.fn() },
  },
}));

vi.mock("$lib/services/brand-context/brand-context.server", () => ({
  listBrandAssets: vi.fn(),
}));

vi.mock("$lib/server/auth-guards", () => ({
  requireAuthenticatedApiUser: vi.fn(),
}));

const prismaModule = await import("$lib/server/prisma");
const brandContextModule =
  await import("$lib/services/brand-context/brand-context.server");
const authModule = await import("$lib/server/auth-guards");
const { GET } = await import("./+server");

const requireApiMock =
  authModule.requireAuthenticatedApiUser as unknown as ReturnType<typeof vi.fn>;
const userBrandMock = (
  prismaModule.prisma as unknown as {
    user_brand: { findUnique: ReturnType<typeof vi.fn> };
  }
).user_brand.findUnique;
const listMock = brandContextModule.listBrandAssets as unknown as ReturnType<
  typeof vi.fn
>;

function makeEvent(query: string) {
  return {
    url: new URL(`http://test.local/api/brand-assets${query}`),
  } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  requireApiMock.mockReturnValue({ session: {}, user: { id: "user-1" } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/brand-assets?brandId=", () => {
  it("returns 401 when unauthenticated", async () => {
    requireApiMock.mockImplementation(() => {
      throw { status: 401 };
    });
    await expect(GET(makeEvent("?brandId=1"))).rejects.toMatchObject({
      status: 401,
    });
  });

  it("returns 400 when brandId is missing", async () => {
    await expect(GET(makeEvent(""))).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 when brandId is not a positive integer", async () => {
    await expect(GET(makeEvent("?brandId=abc"))).rejects.toMatchObject({
      status: 400,
    });
    await expect(GET(makeEvent("?brandId=-1"))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("returns 403 when brand is not assigned", async () => {
    userBrandMock.mockResolvedValue(null);
    await expect(GET(makeEvent("?brandId=7"))).rejects.toMatchObject({
      status: 403,
    });
  });

  it("returns rows scoped to the brand when assigned", async () => {
    userBrandMock.mockResolvedValue({ brandId: 7 });
    listMock.mockResolvedValue([
      {
        id: "a",
        brandId: 7,
        name: "Logo",
        contentType: "image/png",
        sizeBytes: 12,
        createdAt: new Date("2026-05-26T12:00:00Z"),
        localPath: "/tmp/a.png",
      },
    ]);

    const response = await GET(makeEvent("?brandId=7"));
    const body = (await response.json()) as {
      items: Array<{ id: string; brandId: number; name: string }>;
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.brandId).toBe(7);
    expect(body.items[0]!.name).toBe("Logo");
    expect(listMock).toHaveBeenCalledWith(7);
  });
});
