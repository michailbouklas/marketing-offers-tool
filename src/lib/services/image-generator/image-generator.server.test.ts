import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    generatedImage: {
      findMany: vi.fn(),
    },
  },
}));

const prismaModule = await import("$lib/server/prisma");
const { listGeneratedImagesForUser } = await import("./image-generator.server");

const findManyMock = prismaModule.prisma.generatedImage
  .findMany as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.clearAllMocks();
});

describe("listGeneratedImagesForUser", () => {
  beforeEach(() => {
    findManyMock.mockResolvedValue([
      {
        id: "row-1",
        prompt: "a",
        finalPrompt: "a",
        provider: "openai",
        model: "gpt-image-1",
        requestedWidth: 1024,
        requestedHeight: 1024,
        generationWidth: 1024,
        generationHeight: 1024,
        style: null,
        camera: null,
        aspectRatio: null,
        referenceIds: ["ref-a"],
        status: "completed",
        errorMessage: null,
        durationMs: 1500,
        createdAt: new Date("2026-05-26T12:34:56.000Z"),
      },
    ]);
  });

  it("scopes the query to the supplied userId", async () => {
    await listGeneratedImagesForUser("user-9");
    expect(findManyMock).toHaveBeenCalledTimes(1);
    const args = findManyMock.mock.calls[0]![0];
    expect(args.where.userId).toBe("user-9");
  });

  it("orders by createdAt desc and applies the default limit", async () => {
    await listGeneratedImagesForUser("user-1");
    const args = findManyMock.mock.calls[0]![0];
    expect(args.orderBy).toEqual({ createdAt: "desc" });
    expect(args.take).toBe(50);
  });

  it("filters by `since` when a valid ISO string is supplied", async () => {
    await listGeneratedImagesForUser("user-1", {
      since: "2026-05-26T00:00:00.000Z",
    });
    const args = findManyMock.mock.calls[0]![0];
    expect(args.where.createdAt.gte).toBeInstanceOf(Date);
    expect((args.where.createdAt.gte as Date).toISOString()).toBe(
      "2026-05-26T00:00:00.000Z",
    );
  });

  it("ignores `since` when invalid", async () => {
    await listGeneratedImagesForUser("user-1", { since: "not-a-date" });
    const args = findManyMock.mock.calls[0]![0];
    expect(args.where.createdAt).toBeUndefined();
  });

  it("clamps an oversized limit", async () => {
    await listGeneratedImagesForUser("user-1", { limit: 999999 });
    const args = findManyMock.mock.calls[0]![0];
    expect(args.take).toBe(200);
  });

  it("maps rows to DTOs with ISO createdAt and JSON-array referenceIds", async () => {
    const result = await listGeneratedImagesForUser("user-1");
    expect(result).toHaveLength(1);
    expect(result[0]!.createdAt).toBe("2026-05-26T12:34:56.000Z");
    expect(result[0]!.referenceIds).toEqual(["ref-a"]);
    expect(result[0]!.status).toBe("completed");
  });
});
