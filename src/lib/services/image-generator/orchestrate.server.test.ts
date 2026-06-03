import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    generatedImage: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    referenceImage: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("$lib/server/env", () => ({
  getImageGeneratorEnv: vi.fn(),
}));

vi.mock("$lib/server/image-size", () => ({
  resizeToRequested: vi.fn(async (bytes: Buffer) => bytes),
}));

vi.mock("$lib/services/image-providers/factory.server", () => ({
  getImageProvider: vi.fn(),
}));

const prismaModule = await import("$lib/server/prisma");
const envModule = await import("$lib/server/env");
const factoryModule =
  await import("$lib/services/image-providers/factory.server");
const { generateOneRow, kickoffPendingGenerations } =
  await import("./orchestrate.server");

const findUnique = prismaModule.prisma.generatedImage
  .findUnique as unknown as ReturnType<typeof vi.fn>;
const updateMock = prismaModule.prisma.generatedImage
  .update as unknown as ReturnType<typeof vi.fn>;
const findRefs = prismaModule.prisma.referenceImage
  .findMany as unknown as ReturnType<typeof vi.fn>;
const mockEnv = envModule.getImageGeneratorEnv as unknown as ReturnType<
  typeof vi.fn
>;
const getProvider = factoryModule.getImageProvider as unknown as ReturnType<
  typeof vi.fn
>;

let workdir: string;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "orchestrate-"));
  mockEnv.mockReturnValue({
    IMAGE_ROUTER_API_KEY: "ir",
    IMAGE_ROUTER_BASE_URL: "https://api.imagerouter.io",
    IMAGE_ROUTER_MODELS: [],
    OPENAI_API_KEY: "sk",
    OPENAI_IMAGE_MODELS: [],
    DEFAULT_PROVIDER: "imagerouter",
    DEFAULT_MODEL: "gpt-image-1",
    UPLOADS_DIR: workdir,
    SAMPLES_PER_MODEL_MAX: 5,
  });
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
  vi.clearAllMocks();
});

function makePendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    userId: "user-1",
    prompt: "p",
    finalPrompt: "fp",
    provider: "openai",
    model: "gpt-image-1",
    requestedWidth: 1024,
    requestedHeight: 1024,
    generationWidth: 1024,
    generationHeight: 1024,
    style: null,
    camera: null,
    aspectRatio: null,
    referenceIds: [],
    status: "pending",
    errorMessage: null,
    localPath: null,
    durationMs: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("generateOneRow — happy path", () => {
  it("calls the provider, writes the file, and marks the row completed", async () => {
    findUnique.mockResolvedValue(makePendingRow());
    const generateMock = vi
      .fn()
      .mockResolvedValue({ bytes: PNG, providerMetadata: { x: 1 } });
    getProvider.mockReturnValue({ generateImage: generateMock });

    await generateOneRow("row-1");

    expect(generateMock).toHaveBeenCalledWith({
      prompt: "fp",
      width: 1024,
      height: 1024,
      model: "gpt-image-1",
      references: undefined,
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    const args = updateMock.mock.calls[0]![0];
    expect(args.where).toEqual({ id: "row-1" });
    expect(args.data.status).toBe("completed");
    expect(args.data.localPath).toContain("row-1.png");
    expect(args.data.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("forwards quality, background, and inputFidelity from the row", async () => {
    findUnique.mockResolvedValue(
      makePendingRow({
        quality: "high",
        background: "transparent",
        inputFidelity: "high",
      }),
    );
    const generateMock = vi.fn().mockResolvedValue({ bytes: PNG });
    getProvider.mockReturnValue({ generateImage: generateMock });

    await generateOneRow("row-1");

    expect(generateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quality: "high",
        background: "transparent",
        inputFidelity: "high",
      }),
    );
  });

  it("ignores unrecognised quality/background/inputFidelity values", async () => {
    findUnique.mockResolvedValue(
      makePendingRow({
        quality: "ultra",
        background: "rainbow",
        inputFidelity: "max",
      }),
    );
    const generateMock = vi.fn().mockResolvedValue({ bytes: PNG });
    getProvider.mockReturnValue({ generateImage: generateMock });

    await generateOneRow("row-1");

    const arg = generateMock.mock.calls[0]![0];
    expect(arg.quality).toBeUndefined();
    expect(arg.background).toBeUndefined();
    expect(arg.inputFidelity).toBeUndefined();
  });

  it("retries once and completes when the provider fails transiently", async () => {
    findUnique.mockResolvedValue(makePendingRow());
    const generateMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient 503"))
      .mockResolvedValue({ bytes: PNG });
    getProvider.mockReturnValue({ generateImage: generateMock });

    await generateOneRow("row-1");

    expect(generateMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0]![0].data.status).toBe("completed");
  });

  it("resolves reference paths and forwards them to the provider", async () => {
    findUnique.mockResolvedValue(
      makePendingRow({ referenceIds: ["ref-a", "ref-b"] }),
    );
    findRefs.mockResolvedValue([
      { localPath: "/uploads/references/ref-a.png" },
      { localPath: "/uploads/references/ref-b.png" },
    ]);

    const generateMock = vi.fn().mockResolvedValue({ bytes: PNG });
    getProvider.mockReturnValue({ generateImage: generateMock });

    await generateOneRow("row-1");

    expect(findRefs).toHaveBeenCalledWith({
      where: { id: { in: ["ref-a", "ref-b"] }, userId: "user-1" },
      select: { localPath: true },
    });
    expect(generateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        references: [
          "/uploads/references/ref-a.png",
          "/uploads/references/ref-b.png",
        ],
      }),
    );
  });
});

describe("generateOneRow — failure paths", () => {
  it("marks the row failed when the provider throws", async () => {
    findUnique.mockResolvedValue(makePendingRow());
    getProvider.mockReturnValue({
      generateImage: vi.fn().mockRejectedValue(new Error("provider exploded")),
    });

    await generateOneRow("row-1");

    expect(updateMock).toHaveBeenCalledTimes(1);
    const args = updateMock.mock.calls[0]![0];
    expect(args.data.status).toBe("failed");
    expect(args.data.errorMessage).toBe("provider exploded");
    expect(args.data.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("marks the row failed when the provider factory throws (e.g. missing key)", async () => {
    findUnique.mockResolvedValue(makePendingRow());
    getProvider.mockImplementation(() => {
      throw new Error("OPENAI_API_KEY is not configured");
    });

    await generateOneRow("row-1");

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0]![0].data.status).toBe("failed");
  });

  it("does nothing when the row is missing", async () => {
    findUnique.mockResolvedValue(null);
    await generateOneRow("row-x");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("skips rows that are no longer pending", async () => {
    findUnique.mockResolvedValue(makePendingRow({ status: "completed" }));
    await generateOneRow("row-1");
    expect(getProvider).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("kickoffPendingGenerations", () => {
  it("schedules generateOneRow for each id without blocking the caller", async () => {
    findUnique.mockResolvedValue(makePendingRow());
    getProvider.mockReturnValue({
      generateImage: vi.fn().mockResolvedValue({ bytes: PNG }),
    });

    kickoffPendingGenerations(["row-1", "row-2", "row-3"]);

    // setImmediate runs after the current tick — yield to it
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(findUnique).toHaveBeenCalledTimes(3);
  });

  it("one row failing does not break siblings (parallel direct invocation)", async () => {
    findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => {
        if (where.id === "row-bad") {
          throw new Error("DB outage for this row");
        }
        return makePendingRow({ id: where.id });
      },
    );
    getProvider.mockReturnValue({
      generateImage: vi.fn().mockResolvedValue({ bytes: PNG }),
    });

    await Promise.all([
      generateOneRow("row-ok-1"),
      generateOneRow("row-bad"),
      generateOneRow("row-ok-2"),
    ]);

    const okUpdates = updateMock.mock.calls.filter((c) =>
      String(c[0]!.where.id).startsWith("row-ok"),
    );
    expect(okUpdates).toHaveLength(2);
    for (const call of okUpdates) {
      expect(call[0]!.data.status).toBe("completed");
    }
  });
});
