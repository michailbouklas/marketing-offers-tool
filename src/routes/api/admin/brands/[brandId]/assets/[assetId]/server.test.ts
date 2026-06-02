import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/services/brand-context/brand-context.server", () => ({
  deleteBrandAsset: vi.fn(),
  getBrandAsset: vi.fn(),
}));

vi.mock("$lib/server/auth-guards", () => ({
  requireApiAdminPermission: vi.fn(),
}));

const brandContextModule =
  await import("$lib/services/brand-context/brand-context.server");
const authModule = await import("$lib/server/auth-guards");
const { DELETE } = await import("./+server");

const requireAdminMock =
  authModule.requireApiAdminPermission as unknown as ReturnType<typeof vi.fn>;
const getMock = brandContextModule.getBrandAsset as unknown as ReturnType<
  typeof vi.fn
>;
const deleteMock = brandContextModule.deleteBrandAsset as unknown as ReturnType<
  typeof vi.fn
>;

function makeEvent(params: { brandId?: string; assetId?: string }) {
  return { params } as unknown as Parameters<typeof DELETE>[0];
}

beforeEach(() => {
  requireAdminMock.mockResolvedValue({ session: {}, user: { id: "admin" } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/admin/brands/[brandId]/assets/[assetId]", () => {
  it("non-admin → 302", async () => {
    requireAdminMock.mockImplementation(() => {
      throw { status: 302 };
    });
    await expect(
      DELETE(makeEvent({ brandId: "1", assetId: "x" })),
    ).rejects.toMatchObject({ status: 302 });
  });

  it("returns 404 when asset does not belong to the brand", async () => {
    getMock.mockResolvedValue(null);
    await expect(
      DELETE(makeEvent({ brandId: "1", assetId: "x" })),
    ).rejects.toMatchObject({ status: 404 });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("calls deleteBrandAsset on the asset id", async () => {
    getMock.mockResolvedValue({ id: "x", brandId: 1 });
    deleteMock.mockResolvedValue(undefined);
    const res = await DELETE(makeEvent({ brandId: "1", assetId: "x" }));
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(deleteMock).toHaveBeenCalledWith("x");
  });
});
