import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    generatedCopy: {
      create: vi.fn(),
    },
    copyGenerationFailureLog: {
      create: vi.fn(),
    },
    user_brand: {
      findUnique: vi.fn(),
    },
    brand: {
      findUnique: vi.fn(),
    },
    aggregator_offers: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("$lib/services/brand-context/brand-context.server", () => ({
  getBrandGuidelines: vi.fn(),
}));

vi.mock("$lib/services/text-providers/factory.server", () => ({
  getTextProvider: vi.fn(),
}));

const prismaModule = await import("$lib/server/prisma");
const factoryModule =
  await import("$lib/services/text-providers/factory.server");
const { FakeTextProvider } = await import("$lib/services/text-providers/types");
const {
  buildCopyJsonSchema,
  buildCopySystemPrompt,
  generateCopy,
  parseVariants,
  CopyGenerateValidationError,
} = await import("./generate.server");
const { getChannelConstraints } = await import("./types");

const createMock = prismaModule.prisma.generatedCopy
  .create as unknown as ReturnType<typeof vi.fn>;
const failureLogMock = prismaModule.prisma.copyGenerationFailureLog
  .create as unknown as ReturnType<typeof vi.fn>;
const getTextProviderMock =
  factoryModule.getTextProvider as unknown as ReturnType<typeof vi.fn>;

const pushFields = getChannelConstraints("push_sms", "push")!;

function pushVariant(suffix = "") {
  return {
    el: { title: `Τίτλος${suffix}`, body: `Κείμενο${suffix}` },
    en: { title: `Title${suffix}`, body: `Body${suffix}` },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  createMock.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: "copy-1",
      brandId: null,
      offerId: null,
      ...data,
      createdAt: new Date("2026-06-05T00:00:00Z"),
    }),
  );
});

describe("buildCopySystemPrompt", () => {
  it("prepends brand guidelines and includes limits, count, and tone", () => {
    const prompt = buildCopySystemPrompt({
      copyType: "push_sms",
      channel: "push",
      fields: pushFields,
      variantCount: 3,
      brandGuidelines: "Always be friendly.",
      tone: "urgent",
    });

    expect(prompt.startsWith("Brand guidelines:\nAlways be friendly.")).toBe(
      true,
    );
    expect(prompt).toContain("at most 65 characters");
    expect(prompt).toContain("at most 178 characters");
    expect(prompt).toContain("exactly 3 distinct variants");
    expect(prompt).toContain("Tone of voice: urgent.");
  });

  it("omits the guidelines block when none are provided", () => {
    const prompt = buildCopySystemPrompt({
      copyType: "banner_headline",
      channel: "banner",
      fields: getChannelConstraints("banner_headline", "banner")!,
      variantCount: 1,
    });
    expect(prompt).not.toContain("Brand guidelines:");
  });
});

describe("buildCopyJsonSchema", () => {
  it("builds a strict schema with all fields required in both languages", () => {
    const schema = buildCopyJsonSchema({ fields: pushFields, variantCount: 2 });

    const variants = (
      schema as {
        properties: { variants: Record<string, unknown> };
      }
    ).properties.variants;
    expect(variants.minItems).toBe(2);
    expect(variants.maxItems).toBe(2);

    const items = variants.items as {
      required: string[];
      additionalProperties: boolean;
      properties: { el: { required: string[]; additionalProperties: boolean } };
    };
    expect(items.required).toEqual(["el", "en"]);
    expect(items.additionalProperties).toBe(false);
    expect(items.properties.el.required).toEqual(["title", "body"]);
    expect(items.properties.el.additionalProperties).toBe(false);
  });
});

describe("parseVariants", () => {
  it("parses and trims well-formed variants", () => {
    const variants = parseVariants(
      { variants: [pushVariant(" ")] },
      pushFields,
    );
    expect(variants).toHaveLength(1);
    expect(variants[0]!.en.title).toBe("Title");
    expect(variants[0]!.el.body).toBe("Κείμενο");
  });

  it("rejects variants missing a language version or field", () => {
    expect(() =>
      parseVariants({ variants: [{ el: pushVariant().el }] }, pushFields),
    ).toThrow(/missing the "en" version/);
    expect(() =>
      parseVariants(
        { variants: [{ el: pushVariant().el, en: { title: "x" } }] },
        pushFields,
      ),
    ).toThrow(/missing "body"/);
  });
});

describe("generateCopy", () => {
  it("rejects a channel that does not belong to the copy type", async () => {
    await expect(
      generateCopy({
        userId: "user-1",
        body: {
          copyType: "push_sms",
          channel: "instagram",
          brief: "Promo",
          provider: "openai",
        },
      }),
    ).rejects.toBeInstanceOf(CopyGenerateValidationError);
  });

  it("persists a completed row and returns variants on success", async () => {
    getTextProviderMock.mockReturnValue(
      new FakeTextProvider({
        content: { variants: [pushVariant("1"), pushVariant("2")] },
      }),
    );

    const dto = await generateCopy({
      userId: "user-1",
      body: {
        copyType: "push_sms",
        channel: "push",
        brief: "Promote the lunch deal",
        variantCount: 2,
        provider: "openai",
      },
    });

    expect(dto.status).toBe("completed");
    expect(dto.variants).toHaveLength(2);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0]![0].data.status).toBe("completed");
    expect(failureLogMock).not.toHaveBeenCalled();
  });

  it("retries, persists a failed row, and writes failure logs when the provider keeps failing", async () => {
    const calls: unknown[] = [];
    getTextProviderMock.mockReturnValue(
      new FakeTextProvider({
        error: new Error("boom"),
        recordCalls: calls as never,
      }),
    );

    const dto = await generateCopy({
      userId: "user-1",
      body: {
        copyType: "push_sms",
        channel: "push",
        brief: "Promote the lunch deal",
        provider: "openai",
      },
    });

    expect(dto.status).toBe("failed");
    expect(dto.errorMessage).toBe("boom");
    expect(calls).toHaveLength(2);
    expect(failureLogMock).toHaveBeenCalledTimes(2);
  });
});
