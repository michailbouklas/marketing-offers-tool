import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    user_brand: { findUnique: vi.fn() },
  },
}));

vi.mock("$lib/services/brand-context/brand-context.server", () => ({
  searchBrandAssets: vi.fn(),
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
const searchMock =
  brandContextModule.searchBrandAssets as unknown as ReturnType<typeof vi.fn>;

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

  it("returns 400 when page is not a positive integer", async () => {
    await expect(GET(makeEvent("?brandId=7&page=0"))).rejects.toMatchObject({
      status: 400,
    });
    await expect(GET(makeEvent("?brandId=7&page=abc"))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("returns 403 when brand is not assigned", async () => {
    userBrandMock.mockResolvedValue(null);
    await expect(GET(makeEvent("?brandId=7"))).rejects.toMatchObject({
      status: 403,
    });
  });

  it("returns paginated rows scoped to the brand when assigned", async () => {
    userBrandMock.mockResolvedValue({ brandId: 7 });
    searchMock.mockResolvedValue({
      items: [
        {
          id: "a",
          brandId: 7,
          name: "logo.png",
          displayName: "Logo",
          contentType: "image/png",
          sizeBytes: 12,
          createdAt: new Date("2026-05-26T12:00:00Z"),
          localPath: "/tmp/a.png",
        },
      ],
      total: 1,
    });

    const response = await GET(makeEvent("?brandId=7"));
    const body = (await response.json()) as {
      items: Array<{
        id: string;
        brandId: number;
        name: string;
        displayName: string | null;
      }>;
      total: number;
      page: number;
      pageSize: number;
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.brandId).toBe(7);
    expect(body.items[0]!.name).toBe("logo.png");
    expect(body.items[0]!.displayName).toBe("Logo");
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(50);
    expect(searchMock).toHaveBeenCalledWith({
      brandId: 7,
      search: undefined,
      page: 1,
      pageSize: 50,
    });
  });

  it("forwards search and page parameters", async () => {
    userBrandMock.mockResolvedValue({ brandId: 7 });
    searchMock.mockResolvedValue({ items: [], total: 0 });

    const response = await GET(makeEvent("?brandId=7&search=logo&page=2"));
    const body = (await response.json()) as { page: number };
    expect(body.page).toBe(2);
    expect(searchMock).toHaveBeenCalledWith({
      brandId: 7,
      search: "logo",
      page: 2,
      pageSize: 50,
    });
  });
});
