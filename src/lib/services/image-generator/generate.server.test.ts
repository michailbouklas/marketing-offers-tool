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
    user_brand: {
      findUnique: vi.fn(),
    },
    brand: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("$lib/services/brand-context/brand-context.server", () => ({
  getBrandGuidelines: vi.fn(),
}));

const envModule = await import("$lib/server/env");
const configModule =
  await import("$lib/services/image-providers/config.server");
const prismaModule = await import("$lib/server/prisma");
const brandContextModule =
  await import("$lib/services/brand-context/brand-context.server");
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
const userBrandFindMock = (
  prismaModule.prisma as unknown as {
    user_brand: { findUnique: ReturnType<typeof vi.fn> };
  }
).user_brand.findUnique;
const brandFindMock = (
  prismaModule.prisma as unknown as {
    brand: { findUnique: ReturnType<typeof vi.fn> };
  }
).brand.findUnique;
const getBrandGuidelinesMock =
  brandContextModule.getBrandGuidelines as unknown as ReturnType<typeof vi.fn>;

function modelCfg(
  id: string,
  sizes: string[] = ["1024x1024", "1536x1024", "1024x1536"],
) {
  return {
    id,
    sizes,
    supportsQuality: true,
    supportsReferences: true,
    supportsMask: false,
  };
}

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
        models: [
          modelCfg("openai/gpt-image-1"),
          modelCfg("google/nano-banana-2"),
        ],
      },
      { id: "openai", models: [modelCfg("gpt-image-1")] },
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
  userBrandFindMock.mockResolvedValue(null);
  brandFindMock.mockResolvedValue(null);
  getBrandGuidelinesMock.mockResolvedValue(null);
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

  it("prepends brand guidelines before style/camera/aspect/prompt", () => {
    expect(
      buildFinalPrompt({
        prompt: "a cat",
        style: "photorealistic",
        camera: "macro shot",
        aspectRatio: "widescreen",
        brandGuidelines: "Brand: vibrant colours.",
      }),
    ).toBe(
      "Brand: vibrant colours. Style: photorealistic. Camera: macro shot. Aspect ratio: widescreen. a cat",
    );
  });

  it("skips blank/whitespace brand guidelines", () => {
    expect(buildFinalPrompt({ prompt: "a cat", brandGuidelines: "   " })).toBe(
      "a cat",
    );
  });

  it("appends a negative-prompt clause after the prompt", () => {
    expect(
      buildFinalPrompt({
        prompt: "a cat",
        style: "photorealistic",
        negativePrompt: "text, watermark",
      }),
    ).toBe(
      "Style: photorealistic. a cat Avoid the following: text, watermark.",
    );
  });

  it("skips blank/whitespace negative prompts", () => {
    expect(buildFinalPrompt({ prompt: "a cat", negativePrompt: "   " })).toBe(
      "a cat",
    );
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
      providers: [{ id: "openai", models: [modelCfg("gpt-image-1")] }],
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

  it("derives aspectRatio from the chosen resolution", async () => {
    await createPendingGenerations({
      userId: "user-1",
      body: { prompt: "x", provider: "imagerouter", size: "1536x1024" },
    });

    expect(createMock.mock.calls[0]![0].data).toMatchObject({
      requestedWidth: 1536,
      requestedHeight: 1024,
      aspectRatio: "3:2",
    });
  });

  it("snaps the requested size to the selected model's supported sizes", async () => {
    mockConfig.mockReturnValue({
      providers: [
        {
          id: "imagerouter",
          models: [modelCfg("flux", ["1024x576", "576x1024"])],
        },
      ],
      defaultProvider: "imagerouter",
      defaultModel: "flux",
      samplesPerModelMax: 5,
    });

    await createPendingGenerations({
      userId: "user-1",
      body: {
        prompt: "x",
        provider: "imagerouter",
        models: ["flux"],
        size: "1024x1024",
      },
    });

    const data = createMock.mock.calls[0]![0].data;
    // 1024×1024 is not offered by this model; it snaps to the nearest by ratio.
    expect(data.requestedWidth).toBe(1024);
    expect(data.requestedHeight).toBe(1024);
    expect(`${data.generationWidth}x${data.generationHeight}`).toBe("576x1024");
  });

  it("resolves size 'auto' to the model's primary concrete size", async () => {
    mockConfig.mockReturnValue({
      providers: [
        {
          id: "imagerouter",
          models: [modelCfg("flux", ["1024x576", "576x1024", "auto"])],
        },
      ],
      defaultProvider: "imagerouter",
      defaultModel: "flux",
      samplesPerModelMax: 5,
    });

    await createPendingGenerations({
      userId: "user-1",
      body: {
        prompt: "x",
        provider: "imagerouter",
        models: ["flux"],
        size: "auto",
      },
    });

    expect(createMock.mock.calls[0]![0].data).toMatchObject({
      requestedWidth: 1024,
      requestedHeight: 576,
      generationWidth: 1024,
      generationHeight: 576,
      aspectRatio: null,
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

  it("rejects an unassigned brandId with GenerateValidationError", async () => {
    userBrandFindMock.mockResolvedValue(null);
    await expect(
      createPendingGenerations({
        userId: "user-1",
        body: { prompt: "x", provider: "imagerouter", brandId: 42 },
      }),
    ).rejects.toBeInstanceOf(GenerateValidationError);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects an assigned but inactive / slug-less brand", async () => {
    userBrandFindMock.mockResolvedValue({ brandId: 42 });
    brandFindMock.mockResolvedValue({ slug: "", active: true });
    await expect(
      createPendingGenerations({
        userId: "user-1",
        body: { prompt: "x", provider: "imagerouter", brandId: 42 },
      }),
    ).rejects.toBeInstanceOf(GenerateValidationError);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("prepends brand guidelines and persists brandId on each row", async () => {
    userBrandFindMock.mockResolvedValue({ brandId: 42 });
    brandFindMock.mockResolvedValue({ slug: "acme", active: true });
    getBrandGuidelinesMock.mockResolvedValue("Brand rules: pop colours.");

    const rows = await createPendingGenerations({
      userId: "user-1",
      body: {
        prompt: "a cat",
        provider: "imagerouter",
        style: "photorealistic",
        brandId: 42,
      },
    });

    expect(getBrandGuidelinesMock).toHaveBeenCalledWith("acme", "./uploads");
    expect(rows[0]!.finalPrompt.startsWith("Brand rules: pop colours.")).toBe(
      true,
    );
    for (const call of createMock.mock.calls) {
      expect(call[0]!.data.brandId).toBe(42);
    }
  });

  it("persists null brandId when none is provided", async () => {
    await createPendingGenerations({
      userId: "user-1",
      body: { prompt: "x", provider: "imagerouter" },
    });
    expect(createMock.mock.calls[0]![0].data.brandId).toBeNull();
    expect(userBrandFindMock).not.toHaveBeenCalled();
  });

  it("honors samplesPerModel for a single model (allModels=false)", async () => {
    const rows = await createPendingGenerations({
      userId: "user-1",
      body: {
        prompt: "a cat",
        provider: "imagerouter",
        model: "gpt-image-1",
        samplesPerModel: 3,
      },
    });
    expect(rows).toHaveLength(3);
    for (const call of createMock.mock.calls) {
      expect(call[0]!.data.model).toBe("gpt-image-1");
    }
  });

  it("rejects samplesPerModel > max even for a single model", async () => {
    await expect(
      createPendingGenerations({
        userId: "user-1",
        body: { prompt: "x", provider: "imagerouter", samplesPerModel: 999 },
      }),
    ).rejects.toBeInstanceOf(GenerateValidationError);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("uses a client-supplied brandGuidelines override instead of the file", async () => {
    userBrandFindMock.mockResolvedValue({ brandId: 42 });
    brandFindMock.mockResolvedValue({ slug: "acme", active: true });
    getBrandGuidelinesMock.mockResolvedValue("STORED guidelines.");

    const rows = await createPendingGenerations({
      userId: "user-1",
      body: {
        prompt: "a cat",
        provider: "imagerouter",
        brandId: 42,
        brandGuidelines: "EDITED guidelines.",
      },
    });

    expect(getBrandGuidelinesMock).not.toHaveBeenCalled();
    expect(rows[0]!.finalPrompt.startsWith("EDITED guidelines.")).toBe(true);
  });

  it("treats an empty brandGuidelines override as no guidelines prefix", async () => {
    userBrandFindMock.mockResolvedValue({ brandId: 42 });
    brandFindMock.mockResolvedValue({ slug: "acme", active: true });

    const rows = await createPendingGenerations({
      userId: "user-1",
      body: {
        prompt: "a cat",
        provider: "imagerouter",
        brandId: 42,
        brandGuidelines: "",
      },
    });

    expect(getBrandGuidelinesMock).not.toHaveBeenCalled();
    expect(rows[0]!.finalPrompt).toBe("a cat");
  });

  it("creates one batch per model when body.models has explicit picks", async () => {
    const rows = await createPendingGenerations({
      userId: "user-1",
      body: {
        prompt: "a cat",
        provider: "imagerouter",
        models: ["openai/gpt-image-1", "google/nano-banana-2"],
        samplesPerModel: 2,
      },
    });

    expect(rows).toHaveLength(4); // 2 samples × 2 models
    const models = createMock.mock.calls.map((c) => c[0]!.data.model);
    expect(models.filter((m) => m === "openai/gpt-image-1")).toHaveLength(2);
    expect(models.filter((m) => m === "google/nano-banana-2")).toHaveLength(2);
  });

  it("rejects body.models entries that are not configured on the provider", async () => {
    await expect(
      createPendingGenerations({
        userId: "user-1",
        body: {
          prompt: "x",
          provider: "imagerouter",
          models: ["openai/gpt-image-1", "fictional/unknown-model"],
        },
      }),
    ).rejects.toBeInstanceOf(GenerateValidationError);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("falls back to allModels/model when body.models is empty or missing", async () => {
    const rows = await createPendingGenerations({
      userId: "user-1",
      body: {
        prompt: "a cat",
        provider: "imagerouter",
        models: [],
        model: "openai/gpt-image-1",
      },
    });
    expect(rows).toHaveLength(1);
    expect(createMock.mock.calls[0]![0].data.model).toBe("openai/gpt-image-1");
  });

  it("defaults samplesPerModel to 3 when body.models has multiple entries", async () => {
    const rows = await createPendingGenerations({
      userId: "user-1",
      body: {
        prompt: "a cat",
        provider: "imagerouter",
        models: ["openai/gpt-image-1", "google/nano-banana-2"],
      },
    });
    expect(rows).toHaveLength(6); // 3 samples × 2 models
  });

  it("persists negativePrompt, quality, and background on each row", async () => {
    await createPendingGenerations({
      userId: "user-1",
      body: {
        prompt: "a cat",
        provider: "imagerouter",
        negativePrompt: "text, watermark",
        quality: "high",
        background: "transparent",
      },
    });

    const data = createMock.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      negativePrompt: "text, watermark",
      quality: "high",
      background: "transparent",
    });
    expect(data.finalPrompt).toContain("Avoid the following: text, watermark.");
  });

  it("maps matchReferences to inputFidelity 'high' only when references exist", async () => {
    refFindMock.mockResolvedValue([{ id: "ref-1" }]);
    await createPendingGenerations({
      userId: "user-1",
      body: {
        prompt: "a cat",
        provider: "imagerouter",
        matchReferences: true,
        references: ["ref-1"],
      },
    });
    expect(createMock.mock.calls[0]![0].data.inputFidelity).toBe("high");
  });

  it("leaves inputFidelity null when matchReferences is set but no references", async () => {
    await createPendingGenerations({
      userId: "user-1",
      body: {
        prompt: "a cat",
        provider: "imagerouter",
        matchReferences: true,
      },
    });
    expect(createMock.mock.calls[0]![0].data.inputFidelity).toBeNull();
  });

  it("defaults the new accuracy fields to null when unset", async () => {
    await createPendingGenerations({
      userId: "user-1",
      body: { prompt: "a cat", provider: "imagerouter" },
    });
    expect(createMock.mock.calls[0]![0].data).toMatchObject({
      negativePrompt: null,
      quality: null,
      background: null,
      inputFidelity: null,
    });
  });

  it("de-duplicates body.models entries", async () => {
    const rows = await createPendingGenerations({
      userId: "user-1",
      body: {
        prompt: "a cat",
        provider: "imagerouter",
        models: ["openai/gpt-image-1", "openai/gpt-image-1"],
        samplesPerModel: 1,
      },
    });
    expect(rows).toHaveLength(1);
    expect(createMock.mock.calls[0]![0].data.model).toBe("openai/gpt-image-1");
  });
});
