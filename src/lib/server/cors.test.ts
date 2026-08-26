import type { RequestEvent, RequestHandler } from "@sveltejs/kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExternalApiError } from "./external-api-error";

vi.mock("$lib/server/env", () => ({
  getOpenWebUiEnv: vi.fn(),
}));

const envModule = await import("$lib/server/env");
const { corsHeaders, preflight, withCors } = await import("./cors");

const getEnvMock = envModule.getOpenWebUiEnv as unknown as ReturnType<
  typeof vi.fn
>;

const ALLOWED = "https://chat.example";

function makeEvent(headers: Record<string, string> = {}): RequestEvent {
  return {
    request: new Request("http://test.local/api/openwebui-tools/ask-sales", {
      method: "POST",
      headers,
    }),
  } as unknown as RequestEvent;
}

beforeEach(() => {
  getEnvMock.mockReturnValue({ OPENWEBUI_ORIGIN: [ALLOWED] });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("corsHeaders", () => {
  it("echoes an allowed origin", () => {
    const headers = corsHeaders(makeEvent({ origin: ALLOWED }));

    expect(headers["Access-Control-Allow-Origin"]).toBe(ALLOWED);
    expect(headers["Access-Control-Allow-Headers"]).toContain("Authorization");
    expect(headers.Vary).toBe("Origin");
    expect(headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("returns nothing for a disallowed or missing origin", () => {
    expect(corsHeaders(makeEvent({ origin: "https://evil.example" }))).toEqual(
      {},
    );
    expect(corsHeaders(makeEvent())).toEqual({});
  });

  it("supports the wildcard for local development", () => {
    getEnvMock.mockReturnValue({ OPENWEBUI_ORIGIN: ["*"] });

    expect(
      corsHeaders(makeEvent({ origin: "http://localhost:8080" }))[
        "Access-Control-Allow-Origin"
      ],
    ).toBe("http://localhost:8080");
  });
});

describe("preflight", () => {
  it("answers 204 with headers for an allowed origin", () => {
    const response = preflight(makeEvent({ origin: ALLOWED }));

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED);
  });

  it("answers 403 for a disallowed origin", () => {
    expect(
      preflight(makeEvent({ origin: "https://evil.example" })).status,
    ).toBe(403);
  });
});

describe("withCors", () => {
  it("adds the headers to a successful response", async () => {
    const handler: RequestHandler = async () =>
      new Response("ok", { status: 200 });

    const response = await withCors(handler)(makeEvent({ origin: ALLOWED }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED);
  });

  it("turns thrown API errors into JSON that still carries the headers", async () => {
    const handler: RequestHandler = async () => {
      throw new ExternalApiError(
        401,
        "invalid_api_key",
        "Invalid bearer token.",
      );
    };

    const response = await withCors(handler)(makeEvent({ origin: ALLOWED }));

    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_api_key" },
    });
  });
});
