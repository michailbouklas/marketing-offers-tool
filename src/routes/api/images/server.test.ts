import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

vi.mock("$lib/services/image-generator/image-generator.server", () => ({
  listGeneratedImagesForUser: vi.fn(),
}));

const service =
  await import("$lib/services/image-generator/image-generator.server");
const { GET } = await import("./+server");

const mockList = service.listGeneratedImagesForUser as unknown as ReturnType<
  typeof vi.fn
>;

function buildEvent(
  url: string,
  overrides: Partial<RequestEvent["locals"]> = {},
): RequestEvent {
  return {
    locals: {
      session: { id: "session-1", userId: "user-1" },
      user: { id: "user-1", email: "x@example.com" },
      ...overrides,
    },
    url: new URL(`http://localhost${url}`),
  } as unknown as RequestEvent;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/images", () => {
  beforeEach(() => {
    mockList.mockResolvedValue([
      {
        id: "img-1",
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
        status: "completed",
        errorMessage: null,
        durationMs: 1234,
        createdAt: "2026-05-26T12:00:00.000Z",
      },
    ]);
  });

  it("returns 401 when unauth", async () => {
    const event = buildEvent("/api/images", { session: null, user: null });
    const response = await (GET as (e: RequestEvent) => Promise<Response>)(
      event,
    ).catch((thrown: Response) => thrown);
    expect(response.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("calls the service scoped to the current user.id", async () => {
    await (GET as (e: RequestEvent) => Promise<Response>)(
      buildEvent("/api/images"),
    );
    expect(mockList).toHaveBeenCalledWith("user-1", {
      since: undefined,
      limit: undefined,
    });
  });

  it("forwards since and limit query params to the service", async () => {
    await (GET as (e: RequestEvent) => Promise<Response>)(
      buildEvent("/api/images?since=2026-05-26T00:00:00Z&limit=10"),
    );
    expect(mockList).toHaveBeenCalledWith("user-1", {
      since: "2026-05-26T00:00:00Z",
      limit: 10,
    });
  });

  it("returns the items as JSON under { items }", async () => {
    const response = await (GET as (e: RequestEvent) => Promise<Response>)(
      buildEvent("/api/images"),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("img-1");
  });
});
