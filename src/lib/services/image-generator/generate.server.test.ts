import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/env", () => ({
  getImageGeneratorEnv: vi.fn(),
}));

vi.mock("$lib/services/image-providers/config.server", () => ({
  buildImageGeneratorConfig: vi.fn(),
}));

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    generatedImage: {
      create: vi.fn(),
    },
    referenceImage: {
      findMany: vi.fn(),
    },
  },
}));

const envModule = await import("$lib/server/env");
const configModule =
  await import("$lib/services/image-providers/config.server");
const prismaModule = await import("$lib/server/prisma");
const { buildFinalPrompt, createPendingGenerations, GenerateValidationError } =
  await import("./generate.server");

const mockEnv = envModule.getImageGeneratorEnv as unknown as ReturnType<
  typeof vi.fn
>;
const mockConfig =
  configModule.buildImageGeneratorConfig as unknown as ReturnType<typeof vi.fn>;
const createMock = prismaModule.prisma.generatedImage
  .create as unknown as ReturnType<typeof vi.fn>;
const refFindMock = prismaModule.prisma.referenceImage
  .findMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockEnv.mockReturnValue({
    IMAGE_ROUTER_API_KEY: "ir-key",
    IMAGE_ROUTER_BASE_URL: "https://api.imagerouter.io",
    IMAGE_ROUTER_MODELS: ["openai/gpt-image-1", "google/nano-banana-2"],
    OPENAI_API_KEY: "sk",
    OPENAI_IMAGE_MODELS: ["gpt-image-1"],
    DEFAULT_PROVIDER: "imagerouter",
    DEFAULT_MODEL: "gpt-image-1",
    UPLOADS_DIR: "./uploads",
    SAMPLES_PER_MODEL_MAX: 5,
  });
  mockConfig.mockReturnValue({
    providers: [
      {
        id: "imagerouter",
        models: ["openai/gpt-image-1", "google/nano-banana-2"],
        sizes: ["1024x1024"],
      },
      { id: "openai", models: ["gpt-image-1"], sizes: ["1024x1024"] },
    ],
    defaultProvider: "imagerouter",
    defaultModel: "gpt-image-1",
    samplesPerModelMax: 5,
  });
  let nextId = 1;
  createMock.mockImplementation(async ({ data }: { data: unknown }) => ({
    ...(data as object),
    id: `row-${nextId++}`,
    createdAt: new Date("2026-05-26T12:00:00.000Z"),
  }));
  refFindMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("buildFinalPrompt", () => {
  it("returns the bare prompt when no enrichment is supplied", () => {
    expect(buildFinalPrompt({ prompt: "a cat" })).toBe("a cat");
  });

  it("prepends style, camera, and aspect ratio in order", () => {
    expect(
      buildFinalPrompt({
        prompt: "a cat",
        style: "photorealistic",
        camera: "macro shot",
        aspectRatio: "widescreen",
      }),
    ).toBe(
      "Style: photorealistic. Camera: macro shot. Aspect ratio: widescreen. a cat",
    );
  });

  it("omits 'none' values", () => {
    expect(
      buildFinalPrompt({
        prompt: "a cat",
        style: "none",
        camera: "macro shot",
        aspectRatio: "none",
      }),
    ).toBe("Camera: macro shot. a cat");
  });
});

describe("createPendingGenerations", () => {
  it("creates a single pending row when allModels is false", async () => {
    const rows = await createPendingGenerations({
      userId: "user-1",
      body: { prompt: "a cat", provider: "imagerouter" },
    });

    expect(rows).toHaveLength(1);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0]![0].data).toMatchObject({
      userId: "user-1",
      provider: "imagerouter",
      model: "gpt-image-1",
      prompt: "a cat",
      finalPrompt: "a cat",
      status: "pending",
      requestedWidth: 1024,
      requestedHeight: 1024,
    });
  });

  it("creates samplesPerModel × |models| rows when allModels=true", async () => {
    const rows = await createPendingGenerations({
      userId: "user-1",
      body: {
        prompt: "a cat",
        provider: "imagerouter",
        allModels: true,
        samplesPerModel: 3,
      },
    });

    expect(rows).toHaveLength(6); // 3 × 2 models
    const models = createMock.mock.calls.map((c) => c[0]!.data.model);
    expect(models.filter((m) => m === "openai/gpt-image-1")).toHaveLength(3);
    expect(models.filter((m) => m === "google/nano-banana-2")).toHaveLength(3);
    for (const call of createMock.mock.calls) {
      expect(call[0]!.data.userId).toBe("user-1");
      expect(call[0]!.data.status).toBe("pending");
    }
  });

  it("rejects samplesPerModel > SAMPLES_PER_MODEL_MAX", async () => {
    await expect(
      createPendingGenerations({
        userId: "user-1",
        body: {
          prompt: "a cat",
          provider: "imagerouter",
          allModels: true,
          samplesPerModel: 999,
        },
      }),
    ).rejects.toBeInstanceOf(GenerateValidationError);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a provider that is not configured", async () => {
    mockConfig.mockReturnValue({
      providers: [
        { id: "openai", models: ["gpt-image-1"], sizes: ["1024x1024"] },
      ],
      defaultProvider: "openai",
      defaultModel: "gpt-image-1",
      samplesPerModelMax: 5,
    });

    await expect(
      createPendingGenerations({
        userId: "user-1",
        body: { prompt: "x", provider: "imagerouter" },
      }),
    ).rejects.toBeInstanceOf(GenerateValidationError);
  });

  it("rejects references that don't belong to the user", async () => {
    refFindMock.mockResolvedValue([{ id: "ref-1" }]); // 1 found, 2 requested

    await expect(
      createPendingGenerations({
        userId: "user-1",
        body: {
          prompt: "x",
          provider: "imagerouter",
          references: ["ref-1", "ref-2"],
        },
      }),
    ).rejects.toBeInstanceOf(GenerateValidationError);
    expect(refFindMock).toHaveBeenCalledWith({
      where: { id: { in: ["ref-1", "ref-2"] }, userId: "user-1" },
      select: { id: true },
    });
  });

  it("maps aspectRatio=widescreen to 1536x1024", async () => {
    await createPendingGenerations({
      userId: "user-1",
      body: { prompt: "x", provider: "imagerouter", aspectRatio: "widescreen" },
    });

    expect(createMock.mock.calls[0]![0].data).toMatchObject({
      requestedWidth: 1536,
      requestedHeight: 1024,
      aspectRatio: "widescreen",
    });
  });

  it("falls back to env DEFAULT_MODEL when no model is supplied", async () => {
    await createPendingGenerations({
      userId: "user-1",
      body: { prompt: "x", provider: "imagerouter" },
    });
    expect(createMock.mock.calls[0]![0].data.model).toBe("gpt-image-1");
  });

  it("respects an explicit model override", async () => {
    await createPendingGenerations({
      userId: "user-1",
      body: { prompt: "x", provider: "imagerouter", model: "custom-model" },
    });
    expect(createMock.mock.calls[0]![0].data.model).toBe("custom-model");
  });

  it("uses size when aspectRatio is not provided", async () => {
    await createPendingGenerations({
      userId: "user-1",
      body: { prompt: "x", provider: "imagerouter", size: "1280x720" },
    });

    expect(createMock.mock.calls[0]![0].data).toMatchObject({
      requestedWidth: 1280,
      requestedHeight: 720,
      generationWidth: 1536,
      generationHeight: 1024,
    });
  });
});
