import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

vi.mock("$lib/server/env", () => ({
  getImageGeneratorEnv: vi.fn(),
}));

vi.mock("$lib/services/image-providers/enhance.server", () => ({
  PromptEnhancer: vi.fn().mockImplementation(() => ({
    enhance: vi.fn(),
  })),
}));

const envModule = await import("$lib/server/env");
const enhanceModule =
  await import("$lib/services/image-providers/enhance.server");
const { POST } = await import("./+server");

const mockEnv = envModule.getImageGeneratorEnv as unknown as ReturnType<
  typeof vi.fn
>;
const MockEnhancer = enhanceModule.PromptEnhancer as unknown as ReturnType<
  typeof vi.fn
>;

function buildEvent(
  body: unknown,
  overrides: Partial<RequestEvent["locals"]> = {},
): RequestEvent {
  const request = new Request("http://localhost/api/images/enhance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return {
    locals: {
      session: { id: "session-1", userId: "user-1" },
      user: { id: "user-1", email: "x@example.com" },
      ...overrides,
    },
    url: new URL("http://localhost/api/images/enhance"),
    request,
  } as unknown as RequestEvent;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/images/enhance", () => {
  beforeEach(() => {
    mockEnv.mockReturnValue({
      IMAGE_ROUTER_API_KEY: undefined,
      IMAGE_ROUTER_BASE_URL: "https://api.imagerouter.io",
      IMAGE_ROUTER_MODELS: [],
      OPENAI_API_KEY: "sk-test",
      OPENAI_IMAGE_MODELS: [],
      DEFAULT_PROVIDER: "openai",
      DEFAULT_MODEL: "gpt-image-1",
      UPLOADS_DIR: "./uploads",
      SAMPLES_PER_MODEL_MAX: 5,
    });
  });

  it("returns 401 when unauth", async () => {
    const response = await (POST as (e: RequestEvent) => Promise<Response>)(
      buildEvent({ prompt: "p" }, { session: null, user: null }),
    ).catch((thrown: Response) => thrown);

    expect(response.status).toBe(401);
  });

  it("returns 503 when OPENAI_API_KEY is unset", async () => {
    mockEnv.mockReturnValue({
      ...mockEnv.getMockImplementation()?.(),
      IMAGE_ROUTER_API_KEY: undefined,
      IMAGE_ROUTER_BASE_URL: "https://api.imagerouter.io",
      IMAGE_ROUTER_MODELS: [],
      OPENAI_API_KEY: undefined,
      OPENAI_IMAGE_MODELS: [],
      DEFAULT_PROVIDER: "imagerouter",
      DEFAULT_MODEL: "gpt-image-1",
      UPLOADS_DIR: "./uploads",
      SAMPLES_PER_MODEL_MAX: 5,
    });

    const response = await (POST as (e: RequestEvent) => Promise<Response>)(
      buildEvent({ prompt: "p" }),
    ).catch((thrown: Response) => thrown);

    expect(response.status).toBe(503);
    expect(MockEnhancer).not.toHaveBeenCalled();
  });

  it("returns 400 when prompt is missing", async () => {
    const response = await (POST as (e: RequestEvent) => Promise<Response>)(
      buildEvent({}),
    ).catch((thrown: Response) => thrown);

    expect(response.status).toBe(400);
    expect(MockEnhancer).not.toHaveBeenCalled();
  });

  it("returns clarifyingQuestions when the enhancer returns them", async () => {
    const fakeEnhance = vi.fn().mockResolvedValue({
      clarifyingQuestions: [
        { question: "What style?", example: "photorealistic" },
      ],
    });
    MockEnhancer.mockImplementation(() => ({ enhance: fakeEnhance }));

    const response = await (POST as (e: RequestEvent) => Promise<Response>)(
      buildEvent({ prompt: "draw something" }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      clarifyingQuestions: [
        { question: "What style?", example: "photorealistic" },
      ],
    });
    expect(fakeEnhance).toHaveBeenCalledWith("draw something", undefined);
  });

  it("forwards brandGuidelines to the enhancer when provided", async () => {
    const fakeEnhance = vi
      .fn()
      .mockResolvedValue({ enhancedPrompt: "on brand" });
    MockEnhancer.mockImplementation(() => ({ enhance: fakeEnhance }));

    const response = await (POST as (e: RequestEvent) => Promise<Response>)(
      buildEvent({ prompt: "a logo", brandGuidelines: "Use navy and gold." }),
    );

    expect(response.status).toBe(200);
    expect(fakeEnhance).toHaveBeenCalledWith("a logo", "Use navy and gold.");
  });

  it("returns enhancedPrompt when the enhancer rewrites it", async () => {
    const fakeEnhance = vi
      .fn()
      .mockResolvedValue({ enhancedPrompt: "A vivid red cube on white" });
    MockEnhancer.mockImplementation(() => ({ enhance: fakeEnhance }));

    const response = await (POST as (e: RequestEvent) => Promise<Response>)(
      buildEvent({ prompt: "a red cube" }),
    );

    const body = await response.json();
    expect(body).toEqual({ enhancedPrompt: "A vivid red cube on white" });
  });
});
