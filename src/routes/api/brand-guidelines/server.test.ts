import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/env", () => ({
  getImageGeneratorEnv: vi.fn(),
}));

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    user_brand: { findUnique: vi.fn() },
    brand: { findUnique: vi.fn() },
  },
}));

vi.mock("$lib/services/brand-context/brand-context.server", () => ({
  getBrandGuidelines: vi.fn(),
}));

vi.mock("$lib/server/auth-guards", () => ({
  requireAuthenticatedApiUser: vi.fn(),
}));

const envModule = await import("$lib/server/env");
const prismaModule = await import("$lib/server/prisma");
const brandContextModule =
  await import("$lib/services/brand-context/brand-context.server");
const authModule = await import("$lib/server/auth-guards");
const { GET } = await import("./+server");

const mockEnv = envModule.getImageGeneratorEnv as unknown as ReturnType<
  typeof vi.fn
>;
const requireApiMock =
  authModule.requireAuthenticatedApiUser as unknown as ReturnType<typeof vi.fn>;
const userBrandMock = (
  prismaModule.prisma as unknown as {
    user_brand: { findUnique: ReturnType<typeof vi.fn> };
  }
).user_brand.findUnique;
const brandMock = (
  prismaModule.prisma as unknown as {
    brand: { findUnique: ReturnType<typeof vi.fn> };
  }
).brand.findUnique;
const getGuidelinesMock =
  brandContextModule.getBrandGuidelines as unknown as ReturnType<typeof vi.fn>;

function makeEvent(query: string) {
  return {
    url: new URL(`http://test.local/api/brand-guidelines${query}`),
  } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  mockEnv.mockReturnValue({ UPLOADS_DIR: "/tmp/uploads" });
  requireApiMock.mockReturnValue({ session: {}, user: { id: "user-1" } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/brand-guidelines?brandId=", () => {
  it("returns 401 when unauthenticated", async () => {
    requireApiMock.mockImplementation(() => {
      throw { status: 401 };
    });
    await expect(GET(makeEvent("?brandId=1"))).rejects.toMatchObject({
      status: 401,
    });
  });

  it("returns 400 when brandId missing/invalid", async () => {
    await expect(GET(makeEvent(""))).rejects.toMatchObject({ status: 400 });
    await expect(GET(makeEvent("?brandId=abc"))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("returns 403 when brand is not assigned", async () => {
    userBrandMock.mockResolvedValue(null);
    await expect(GET(makeEvent("?brandId=7"))).rejects.toMatchObject({
      status: 403,
    });
  });

  it("returns empty markdown when brand has no slug", async () => {
    userBrandMock.mockResolvedValue({ brandId: 7 });
    brandMock.mockResolvedValue({ slug: "" });
    const res = await GET(makeEvent("?brandId=7"));
    const body = (await res.json()) as { markdown: string };
    expect(body.markdown).toBe("");
    expect(getGuidelinesMock).not.toHaveBeenCalled();
  });

  it("returns the stored guidelines for an assigned brand", async () => {
    userBrandMock.mockResolvedValue({ brandId: 7 });
    brandMock.mockResolvedValue({ slug: "acme" });
    getGuidelinesMock.mockResolvedValue("# rules");
    const res = await GET(makeEvent("?brandId=7"));
    const body = (await res.json()) as { markdown: string };
    expect(body.markdown).toBe("# rules");
    expect(getGuidelinesMock).toHaveBeenCalledWith("acme", "/tmp/uploads");
  });
});
