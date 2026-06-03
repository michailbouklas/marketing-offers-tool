import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/env", () => ({
  getImageGeneratorEnv: vi.fn(),
}));

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    brand: { findUnique: vi.fn() },
  },
}));

vi.mock("$lib/services/brand-context/brand-context.server", () => ({
  getBrandGuidelines: vi.fn(),
  setBrandGuidelines: vi.fn(),
}));

vi.mock("$lib/server/auth-guards", () => ({
  requireApiAdminPermission: vi.fn(),
}));

const envModule = await import("$lib/server/env");
const prismaModule = await import("$lib/server/prisma");
const brandContextModule =
  await import("$lib/services/brand-context/brand-context.server");
const authModule = await import("$lib/server/auth-guards");
const { GET, PUT } = await import("./+server");

const mockEnv = envModule.getImageGeneratorEnv as unknown as ReturnType<
  typeof vi.fn
>;
const requireAdminMock =
  authModule.requireApiAdminPermission as unknown as ReturnType<typeof vi.fn>;
const brandFindMock = (
  prismaModule.prisma as unknown as {
    brand: { findUnique: ReturnType<typeof vi.fn> };
  }
).brand.findUnique;
const getGuidelinesMock =
  brandContextModule.getBrandGuidelines as unknown as ReturnType<typeof vi.fn>;
const setGuidelinesMock =
  brandContextModule.setBrandGuidelines as unknown as ReturnType<typeof vi.fn>;

function makeEvent(params: { brandId?: string }, request?: Request) {
  return { params, request } as unknown as Parameters<typeof PUT>[0];
}

beforeEach(() => {
  mockEnv.mockReturnValue({ UPLOADS_DIR: "/tmp/uploads" });
  requireAdminMock.mockResolvedValue({ session: {}, user: { id: "admin" } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/brands/[brandId]/guidelines", () => {
  it("returns empty string when no guidelines stored", async () => {
    brandFindMock.mockResolvedValue({ id: 1, slug: "acme" });
    getGuidelinesMock.mockResolvedValue(null);
    const res = await GET(makeEvent({ brandId: "1" }));
    const body = (await res.json()) as { markdown: string };
    expect(body.markdown).toBe("");
  });

  it("returns the stored guidelines", async () => {
    brandFindMock.mockResolvedValue({ id: 1, slug: "acme" });
    getGuidelinesMock.mockResolvedValue("# rules");
    const res = await GET(makeEvent({ brandId: "1" }));
    const body = (await res.json()) as { markdown: string };
    expect(body.markdown).toBe("# rules");
  });
});

describe("PUT /api/admin/brands/[brandId]/guidelines", () => {
  it("non-admin → 302", async () => {
    requireAdminMock.mockImplementation(() => {
      throw { status: 302 };
    });
    const req = new Request("http://test.local/", {
      method: "PUT",
      body: "{}",
    });
    await expect(PUT(makeEvent({ brandId: "1" }, req))).rejects.toMatchObject({
      status: 302,
    });
  });

  it("returns 400 on invalid JSON body", async () => {
    brandFindMock.mockResolvedValue({ id: 1, slug: "acme" });
    const req = new Request("http://test.local/", {
      method: "PUT",
      body: "not json",
    });
    await expect(PUT(makeEvent({ brandId: "1" }, req))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("returns 400 when markdown exceeds size limit", async () => {
    brandFindMock.mockResolvedValue({ id: 1, slug: "acme" });
    const huge = "a".repeat(50_001);
    const req = new Request("http://test.local/", {
      method: "PUT",
      body: JSON.stringify({ markdown: huge }),
    });
    await expect(PUT(makeEvent({ brandId: "1" }, req))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("returns 404 when brand is missing", async () => {
    brandFindMock.mockResolvedValue(null);
    const req = new Request("http://test.local/", {
      method: "PUT",
      body: JSON.stringify({ markdown: "x" }),
    });
    await expect(PUT(makeEvent({ brandId: "1" }, req))).rejects.toMatchObject({
      status: 404,
    });
  });

  it("happy path calls setBrandGuidelines with brand slug", async () => {
    brandFindMock.mockResolvedValue({ id: 1, slug: "acme" });
    setGuidelinesMock.mockResolvedValue(undefined);
    const req = new Request("http://test.local/", {
      method: "PUT",
      body: JSON.stringify({ markdown: "# brand" }),
    });
    const res = await PUT(makeEvent({ brandId: "1" }, req));
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(setGuidelinesMock).toHaveBeenCalledWith("acme", "# brand");
  });
});
