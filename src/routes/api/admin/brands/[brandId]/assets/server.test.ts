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
  createBrandAsset: vi.fn(),
  listBrandAssets: vi.fn(),
}));

vi.mock("$lib/server/auth-guards", () => ({
  requireApiPermission: vi.fn(),
}));

const envModule = await import("$lib/server/env");
const prismaModule = await import("$lib/server/prisma");
const brandContextModule =
  await import("$lib/services/brand-context/brand-context.server");
const authModule = await import("$lib/server/auth-guards");
const { GET, POST } = await import("./+server");

const mockEnv = envModule.getImageGeneratorEnv as unknown as ReturnType<
  typeof vi.fn
>;
const requirePermissionMock =
  authModule.requireApiPermission as unknown as ReturnType<typeof vi.fn>;
const brandFindMock = (
  prismaModule.prisma as unknown as {
    brand: { findUnique: ReturnType<typeof vi.fn> };
  }
).brand.findUnique;
const createMock = brandContextModule.createBrandAsset as unknown as ReturnType<
  typeof vi.fn
>;
const listMock = brandContextModule.listBrandAssets as unknown as ReturnType<
  typeof vi.fn
>;

function makeEvent(params: { brandId?: string }, request?: Request) {
  return {
    params,
    request,
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  mockEnv.mockReturnValue({ UPLOADS_DIR: "/tmp/uploads" });
  requirePermissionMock.mockResolvedValue({
    session: {},
    user: { id: "admin" },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("/api/admin/brands/[brandId]/assets", () => {
  it("non-admin redirects to '/' (request thrown by guard)", async () => {
    requirePermissionMock.mockImplementation(() => {
      throw { status: 302 };
    });
    await expect(GET(makeEvent({ brandId: "1" }))).rejects.toMatchObject({
      status: 302,
    });
  });

  it("returns 400 on non-integer brandId", async () => {
    await expect(GET(makeEvent({ brandId: "abc" }))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("GET returns the brand's assets", async () => {
    listMock.mockResolvedValue([
      {
        id: "x",
        brandId: 1,
        name: "logo",
        contentType: "image/png",
        sizeBytes: 5,
        createdAt: new Date("2026-05-26T12:00:00Z"),
        localPath: "/tmp/x.png",
      },
    ]);
    const res = await GET(makeEvent({ brandId: "1" }));
    const body = (await res.json()) as {
      items: Array<{ id: string; name: string }>;
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.name).toBe("logo");
  });

  it("POST returns 404 when brand is missing", async () => {
    brandFindMock.mockResolvedValue(null);
    const req = new Request("http://test.local/", {
      method: "POST",
      body: new FormData(),
    });
    await expect(POST(makeEvent({ brandId: "1" }, req))).rejects.toMatchObject({
      status: 404,
    });
  });

  it("POST returns 400 when brand has empty slug", async () => {
    brandFindMock.mockResolvedValue({ id: 1, slug: "", active: true });
    const req = new Request("http://test.local/", {
      method: "POST",
      body: new FormData(),
    });
    await expect(POST(makeEvent({ brandId: "1" }, req))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("POST returns 400 when no files are provided", async () => {
    brandFindMock.mockResolvedValue({ id: 1, slug: "acme", active: true });
    const form = new FormData();
    const req = new Request("http://test.local/", {
      method: "POST",
      body: form,
    });
    await expect(POST(makeEvent({ brandId: "1" }, req))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("POST returns 400 on unsupported content-type", async () => {
    brandFindMock.mockResolvedValue({ id: 1, slug: "acme", active: true });
    const form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array([1])], "x.bin", { type: "application/json" }),
    );
    const req = new Request("http://test.local/", {
      method: "POST",
      body: form,
    });
    await expect(POST(makeEvent({ brandId: "1" }, req))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("POST happy path uploads multiple files and returns created rows", async () => {
    brandFindMock.mockResolvedValue({ id: 1, slug: "acme", active: true });
    let i = 0;
    createMock.mockImplementation(async ({ name, file }) => ({
      id: `id-${++i}`,
      brandId: 1,
      name,
      contentType: file.type,
      sizeBytes: 1,
      localPath: `/tmp/${i}.png`,
      createdAt: new Date(),
    }));
    const form = new FormData();
    form.append(
      "file1",
      new File([new Uint8Array([1])], "a.png", { type: "image/png" }),
    );
    form.append(
      "file2",
      new File([new Uint8Array([2])], "b.png", { type: "image/png" }),
    );
    const req = new Request("http://test.local/", {
      method: "POST",
      body: form,
    });
    const res = await POST(makeEvent({ brandId: "1" }, req));
    const body = (await res.json()) as { items: Array<{ id: string }> };
    expect(body.items).toHaveLength(2);
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});
