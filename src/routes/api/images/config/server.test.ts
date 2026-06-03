import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

vi.mock("$lib/server/env", () => ({
  getImageGeneratorEnv: vi.fn(),
}));

// Avoid a real /v2/models network call; empty caps → models fall back to
// SUPPORTED_SIZES.
vi.mock("$lib/services/image-providers/imagerouter-models.server", () => ({
  fetchImageRouterModelCaps: vi.fn(async () => new Map()),
}));

const envModule = await import("$lib/server/env");
const { GET } = await import("./+server");

const mockEnv = envModule.getImageGeneratorEnv as unknown as ReturnType<
  typeof vi.fn
>;

function buildEvent(
  overrides: Partial<RequestEvent["locals"]> = {},
): RequestEvent {
  return {
    locals: {
      session: { id: "session-1", userId: "user-1" },
      user: { id: "user-1", email: "x@example.com" },
      ...overrides,
    },
    url: new URL("http://localhost/api/images/config"),
  } as unknown as RequestEvent;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/images/config", () => {
  beforeEach(() => {
    mockEnv.mockReturnValue({
      IMAGE_ROUTER_API_KEY: "ir-key",
      IMAGE_ROUTER_BASE_URL: "https://api.imagerouter.io",
      IMAGE_ROUTER_MODELS: ["openai/gpt-image-1", "google/nano-banana-2"],
      OPENAI_API_KEY: "sk-key",
      OPENAI_IMAGE_MODELS: ["gpt-image-1"],
      DEFAULT_PROVIDER: "imagerouter",
      DEFAULT_MODEL: "gpt-image-1",
      UPLOADS_DIR: "./uploads",
      SAMPLES_PER_MODEL_MAX: 5,
    });
  });

  it("returns 401 when there is no session", async () => {
    const event = buildEvent({ session: null, user: null });
    const response = await (GET as (e: RequestEvent) => Promise<Response>)(
      event,
    ).catch((thrown: Response) => thrown);

    expect(response.status).toBe(401);
  });

  it("returns both providers when both API keys are set", async () => {
    const response = await (GET as (e: RequestEvent) => Promise<Response>)(
      buildEvent(),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.providers.map((p: { id: string }) => p.id)).toEqual([
      "imagerouter",
      "openai",
    ]);
    expect(body.defaultProvider).toBe("imagerouter");
    expect(body.defaultModel).toBe("gpt-image-1");
    expect(body.samplesPerModelMax).toBe(5);
    expect(body.providers[0].models.map((m: { id: string }) => m.id)).toEqual([
      "openai/gpt-image-1",
      "google/nano-banana-2",
    ]);
    expect(body.providers[0].models[0].sizes).toContain("1024x1024");
  });

  it("omits imagerouter when IMAGE_ROUTER_API_KEY is unset (only openai returned)", async () => {
    mockEnv.mockReturnValue({
      IMAGE_ROUTER_API_KEY: undefined,
      IMAGE_ROUTER_BASE_URL: "https://api.imagerouter.io",
      IMAGE_ROUTER_MODELS: [],
      OPENAI_API_KEY: "sk-key",
      OPENAI_IMAGE_MODELS: ["gpt-image-1"],
      DEFAULT_PROVIDER: "imagerouter",
      DEFAULT_MODEL: "gpt-image-1",
      UPLOADS_DIR: "./uploads",
      SAMPLES_PER_MODEL_MAX: 5,
    });

    const response = await (GET as (e: RequestEvent) => Promise<Response>)(
      buildEvent(),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.providers.map((p: { id: string }) => p.id)).toEqual(["openai"]);
    expect(body.defaultProvider).toBe("openai");
  });

  it("omits openai when OPENAI_API_KEY is unset", async () => {
    mockEnv.mockReturnValue({
      IMAGE_ROUTER_API_KEY: "ir-key",
      IMAGE_ROUTER_BASE_URL: "https://api.imagerouter.io",
      IMAGE_ROUTER_MODELS: ["openai/gpt-image-1"],
      OPENAI_API_KEY: undefined,
      OPENAI_IMAGE_MODELS: [],
      DEFAULT_PROVIDER: "openai",
      DEFAULT_MODEL: "gpt-image-1",
      UPLOADS_DIR: "./uploads",
      SAMPLES_PER_MODEL_MAX: 3,
    });

    const response = await (GET as (e: RequestEvent) => Promise<Response>)(
      buildEvent(),
    );

    const body = await response.json();
    expect(body.providers.map((p: { id: string }) => p.id)).toEqual([
      "imagerouter",
    ]);
    expect(body.defaultProvider).toBe("imagerouter");
    expect(body.samplesPerModelMax).toBe(3);
  });

  it("returns no providers and a null defaultProvider when both API keys are unset", async () => {
    mockEnv.mockReturnValue({
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

    const response = await (GET as (e: RequestEvent) => Promise<Response>)(
      buildEvent(),
    );

    const body = await response.json();
    expect(body.providers).toEqual([]);
    expect(body.defaultProvider).toBeNull();
    expect(body.defaultModel).toBeNull();
  });
});
