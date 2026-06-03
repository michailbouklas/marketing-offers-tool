import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("$lib/server/env", () => ({
  getImageGeneratorEnv: vi.fn(),
  getStorageEnv: vi.fn(() => ({})),
}));

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    brandAsset: { findUnique: vi.fn() },
    user_brand: { findUnique: vi.fn() },
    referenceImage: { create: vi.fn() },
  },
}));

vi.mock("$lib/server/auth-guards", () => ({
  requireAuthenticatedApiUser: vi.fn(),
}));

const envModule = await import("$lib/server/env");
const prismaModule = await import("$lib/server/prisma");
const authModule = await import("$lib/server/auth-guards");
const { POST } = await import("./+server");

const mockEnv = envModule.getImageGeneratorEnv as unknown as ReturnType<
  typeof vi.fn
>;
const requireApiMock =
  authModule.requireAuthenticatedApiUser as unknown as ReturnType<typeof vi.fn>;
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
const refCreateMock = (
  prismaModule.prisma as unknown as {
    referenceImage: { create: ReturnType<typeof vi.fn> };
  }
).referenceImage.create;

let workdir: string;
const ASSET_KEY = "brands/acme/assets/a.png";

function makeEvent(body: unknown) {
  return {
    request: {
      json: async () => body,
    },
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "from-brand-asset-"));
  mkdirSync(join(workdir, "brands", "acme", "assets"), { recursive: true });
  writeFileSync(
    join(workdir, "brands", "acme", "assets", "a.png"),
    Buffer.from([1, 2, 3, 4]),
  );
  mockEnv.mockReturnValue({ UPLOADS_DIR: workdir });
  requireApiMock.mockReturnValue({
    session: {},
    user: { id: "user-1" },
  });
  refCreateMock.mockImplementation(async ({ data }) => data);
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("POST /api/images/references/from-brand-asset", () => {
  it("returns 401 when not authenticated", async () => {
    requireApiMock.mockImplementation(() => {
      throw { status: 401 };
    });
    await expect(POST(makeEvent({ assetId: "a" }))).rejects.toMatchObject({
      status: 401,
    });
  });

  it("returns 404 when asset is unknown", async () => {
    brandAssetMock.mockResolvedValue(null);
    await expect(POST(makeEvent({ assetId: "missing" }))).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it("returns 403 when the brand is not assigned to the user", async () => {
    brandAssetMock.mockResolvedValue({
      id: "a",
      brandId: 7,
      localPath: ASSET_KEY,
      contentType: "image/png",
    });
    userBrandMock.mockResolvedValue(null);
    await expect(POST(makeEvent({ assetId: "a" }))).rejects.toMatchObject({
      status: 403,
    });
  });

  it("copies the file under references/ and persists a ReferenceImage row", async () => {
    brandAssetMock.mockResolvedValue({
      id: "a",
      brandId: 7,
      localPath: ASSET_KEY,
      contentType: "image/png",
    });
    userBrandMock.mockResolvedValue({ brandId: 7 });

    const response = await POST(makeEvent({ assetId: "a" }));
    const body = (await response.json()) as { id: string; contentType: string };

    expect(body.contentType).toBe("image/png");
    expect(body.id).toMatch(/[0-9a-f-]{36}/);

    const created = refCreateMock.mock.calls[0]![0].data;
    expect(created.userId).toBe("user-1");
    expect(created.contentType).toBe("image/png");
    expect(created.localPath.endsWith(".png")).toBe(true);
    expect(created.localPath.startsWith("references/")).toBe(true);

    // File copied with same contents (read via the local store layout).
    const copiedPath = join(workdir, ...created.localPath.split("/"));
    expect(readFileSync(copiedPath).equals(Buffer.from([1, 2, 3, 4]))).toBe(
      true,
    );
  });

  it("returns 400 when JSON body is invalid", async () => {
    await expect(POST(makeEvent({}))).rejects.toMatchObject({ status: 400 });
  });
});
