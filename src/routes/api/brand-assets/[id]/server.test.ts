import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    brandAsset: { findUnique: vi.fn() },
    user_brand: { findUnique: vi.fn() },
  },
}));

vi.mock("$lib/server/auth-guards", () => ({
  requireAuthenticatedApiUser: vi.fn(),
}));

vi.mock("$lib/server/env", () => ({
  getImageGeneratorEnv: vi.fn(),
  getStorageEnv: vi.fn(() => ({})),
}));

const prismaModule = await import("$lib/server/prisma");
const authModule = await import("$lib/server/auth-guards");
const envModule = await import("$lib/server/env");
const { GET } = await import("./+server");

const requireApiMock =
  authModule.requireAuthenticatedApiUser as unknown as ReturnType<typeof vi.fn>;
const mockEnv = envModule.getImageGeneratorEnv as unknown as ReturnType<
  typeof vi.fn
>;
const brandAssetMock = (
  prismaModule.prisma as unknown as {
    brandAsset: { findUnique: ReturnType<typeof vi.fn> };
  }
).brandAsset.findUnique;
const userBrandMock = (
  prismaModule.prisma as unknown as {
    user_brand: { findUnique: ReturnType<typeof vi.fn> };
  }
).user_brand.findUnique;

let workdir: string;
const ASSET_KEY = "brands/acme/assets/a.png";

function makeEvent(id: string) {
  return {
    params: { id },
  } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "brand-asset-stream-"));
  mkdirSync(join(workdir, "brands", "acme", "assets"), { recursive: true });
  writeFileSync(
    join(workdir, "brands", "acme", "assets", "a.png"),
    Buffer.from([1, 2, 3, 4, 5]),
  );
  mockEnv.mockReturnValue({ UPLOADS_DIR: workdir });
  requireApiMock.mockReturnValue({ session: {}, user: { id: "user-1" } });
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("GET /api/brand-assets/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    requireApiMock.mockImplementation(() => {
      throw { status: 401 };
    });
    await expect(GET(makeEvent("a"))).rejects.toMatchObject({ status: 401 });
  });

  it("returns 404 when asset is missing", async () => {
    brandAssetMock.mockResolvedValue(null);
    await expect(GET(makeEvent("missing"))).rejects.toMatchObject({
      status: 404,
    });
  });

  it("returns 403 when brand is not assigned to the user", async () => {
    brandAssetMock.mockResolvedValue({
      id: "a",
      brandId: 7,
      localPath: ASSET_KEY,
      contentType: "image/png",
    });
    userBrandMock.mockResolvedValue(null);
    await expect(GET(makeEvent("a"))).rejects.toMatchObject({ status: 403 });
  });

  it("returns 404 when the underlying object is missing", async () => {
    brandAssetMock.mockResolvedValue({
      id: "a",
      brandId: 7,
      localPath: "brands/acme/assets/never-existed.png",
      contentType: "image/png",
    });
    userBrandMock.mockResolvedValue({ brandId: 7 });
    await expect(GET(makeEvent("a"))).rejects.toMatchObject({ status: 404 });
  });

  it("returns 200 with bytes and correct content-type", async () => {
    brandAssetMock.mockResolvedValue({
      id: "a",
      brandId: 7,
      localPath: ASSET_KEY,
      contentType: "image/png",
    });
    userBrandMock.mockResolvedValue({ brandId: 7 });

    const response = await GET(makeEvent("a"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-length")).toBe("5");
    const buf = Buffer.from(await response.arrayBuffer());
    expect(buf.equals(Buffer.from([1, 2, 3, 4, 5]))).toBe(true);
  });
});
