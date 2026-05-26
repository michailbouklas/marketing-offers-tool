import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

vi.mock("$lib/services/image-generator/generate.server", async () => {
  const actual = await vi.importActual<
    typeof import("$lib/services/image-generator/generate.server")
  >("$lib/services/image-generator/generate.server");
  return {
    ...actual,
    createPendingGenerations: vi.fn(),
  };
});

const svc = await import("$lib/services/image-generator/generate.server");
const { POST } = await import("./+server");

const createMock = svc.createPendingGenerations as unknown as ReturnType<
  typeof vi.fn
>;

function buildEvent(
  body: unknown,
  overrides: Partial<RequestEvent["locals"]> = {},
): RequestEvent {
  const request = new Request("http://localhost/api/images/generate", {
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
    url: new URL("http://localhost/api/images/generate"),
    request,
  } as unknown as RequestEvent;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/images/generate", () => {
  beforeEach(() => {
    createMock.mockResolvedValue([
      { id: "row-1", status: "pending" },
      { id: "row-2", status: "pending" },
    ]);
  });

  it("returns 401 when unauth", async () => {
    const response = await (POST as (e: RequestEvent) => Promise<Response>)(
      buildEvent(
        { prompt: "p", provider: "imagerouter" },
        {
          session: null,
          user: null,
        },
      ),
    ).catch((thrown: Response) => thrown);

    expect(response.status).toBe(401);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 400 when prompt is missing", async () => {
    const response = await (POST as (e: RequestEvent) => Promise<Response>)(
      buildEvent({ provider: "imagerouter" }),
    ).catch((thrown: Response) => thrown);

    expect(response.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 400 when provider is invalid", async () => {
    const response = await (POST as (e: RequestEvent) => Promise<Response>)(
      buildEvent({ prompt: "p", provider: "nope" }),
    ).catch((thrown: Response) => thrown);

    expect(response.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("calls the service with userId from the session and returns the items", async () => {
    const response = await (POST as (e: RequestEvent) => Promise<Response>)(
      buildEvent({
        prompt: "draw a cat",
        provider: "imagerouter",
        allModels: true,
        samplesPerModel: 3,
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(2);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0]![0]).toMatchObject({
      userId: "user-1",
      body: {
        prompt: "draw a cat",
        provider: "imagerouter",
        allModels: true,
        samplesPerModel: 3,
      },
    });
  });

  it("returns 400 when the service throws GenerateValidationError", async () => {
    createMock.mockRejectedValue(
      new svc.GenerateValidationError("samplesPerModel too high"),
    );

    const response = await (POST as (e: RequestEvent) => Promise<Response>)(
      buildEvent({
        prompt: "x",
        provider: "imagerouter",
        allModels: true,
        samplesPerModel: 99,
      }),
    ).catch((thrown: Response) => thrown);

    expect(response.status).toBe(400);
  });
});
