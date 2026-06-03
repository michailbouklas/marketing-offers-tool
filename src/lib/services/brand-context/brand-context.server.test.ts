import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    brandAsset: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("$lib/server/env", () => ({
  getImageGeneratorEnv: vi.fn(),
  getStorageEnv: vi.fn(() => ({})),
}));

const prismaModule = await import("$lib/server/prisma");
const envModule = await import("$lib/server/env");
const {
  createBrandAsset,
  deleteBrandAsset,
  getBrandAsset,
  getBrandGuidelines,
  listBrandAssets,
  setBrandGuidelines,
} = await import("./brand-context.server");

const findManyMock = prismaModule.prisma.brandAsset
  .findMany as unknown as ReturnType<typeof vi.fn>;
const findUniqueMock = prismaModule.prisma.brandAsset
  .findUnique as unknown as ReturnType<typeof vi.fn>;
const createMock = prismaModule.prisma.brandAsset
  .create as unknown as ReturnType<typeof vi.fn>;
const deleteMock = prismaModule.prisma.brandAsset
  .delete as unknown as ReturnType<typeof vi.fn>;
const mockEnv = envModule.getImageGeneratorEnv as unknown as ReturnType<
  typeof vi.fn
>;

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "brand-context-"));
  mockEnv.mockReturnValue({ UPLOADS_DIR: workdir });
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
  vi.clearAllMocks();
});

function makeFile(contentType: string, bytes: Buffer, name = "in.bin"): File {
  return new File([new Uint8Array(bytes)], name, { type: contentType });
}

describe("listBrandAssets", () => {
  it("delegates to prisma findMany scoped by brandId", async () => {
    findManyMock.mockResolvedValue([]);
    await listBrandAssets(7);
    expect(findManyMock).toHaveBeenCalledWith({
      where: { brandId: 7 },
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("getBrandAsset", () => {
  it("returns null when row does not exist", async () => {
    findUniqueMock.mockResolvedValue(null);
    expect(await getBrandAsset(1, "missing")).toBeNull();
  });

  it("returns null when row's brandId does not match", async () => {
    findUniqueMock.mockResolvedValue({ id: "a", brandId: 99 });
    expect(await getBrandAsset(1, "a")).toBeNull();
  });

  it("returns the row when brandId matches", async () => {
    const row = { id: "a", brandId: 1, name: "x" };
    findUniqueMock.mockResolvedValue(row);
    expect(await getBrandAsset(1, "a")).toBe(row);
  });
});

describe("createBrandAsset", () => {
  it("writes file then creates prisma row with size and content type", async () => {
    createMock.mockImplementation(async ({ data }) => ({
      ...data,
      createdAt: new Date("2026-05-26T12:00:00Z"),
    }));

    const row = await createBrandAsset({
      brandId: 3,
      slug: "acme",
      file: makeFile("image/png", Buffer.from([1, 2, 3, 4])),
      name: "logo.png",
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const data = createMock.mock.calls[0]![0].data;
    expect(data.brandId).toBe(3);
    expect(data.name).toBe("logo.png");
    expect(data.contentType).toBe("image/png");
    expect(data.sizeBytes).toBe(4);
    expect(data.localPath).toContain("brands");
    expect(data.localPath).toContain("acme");
    expect(data.localPath.endsWith(".png")).toBe(true);
    expect(row.id).toBe(data.id);
  });
});

describe("deleteBrandAsset", () => {
  it("is idempotent when the row does not exist", async () => {
    findUniqueMock.mockResolvedValue(null);
    await deleteBrandAsset("missing");
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("deletes row then removes the object; ignores a missing object", async () => {
    findUniqueMock.mockResolvedValue({
      id: "a",
      localPath: "brands/acme/assets/never-existed.png",
    });
    deleteMock.mockResolvedValue(undefined);
    await deleteBrandAsset("a");
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: "a" } });
  });
});

describe("getBrandGuidelines / setBrandGuidelines", () => {
  it("returns null when guidelines have not been written", async () => {
    expect(await getBrandGuidelines("acme")).toBeNull();
  });

  it("round-trips markdown", async () => {
    await setBrandGuidelines("acme", "# brand\n\nrules");
    expect(await getBrandGuidelines("acme")).toBe("# brand\n\nrules");
  });
});
