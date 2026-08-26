import { RequestContext } from "@mastra/core/request-context";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BRAND_SCOPE_RUNTIME_KEY,
  CHANNEL_RUNTIME_KEY,
} from "$lib/server/mastra/chat-registry";
import { signUserToken } from "./external-auth-token";

vi.mock("$lib/server/env", () => ({
  getOpenWebUiEnv: vi.fn(),
}));

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

vi.mock("$lib/server/auth-guards", () => ({
  userHasPermissionById: vi.fn(),
}));

vi.mock("$lib/server/brand-scope.server", () => ({
  buildBrandScopeRequestContext: vi.fn(),
}));

const envModule = await import("$lib/server/env");
const prismaModule = await import("$lib/server/prisma");
const guardsModule = await import("$lib/server/auth-guards");
const brandScopeModule = await import("$lib/server/brand-scope.server");
const {
  authenticateExternalUser,
  externalErrorResponse,
  ExternalApiError,
  requireExternalKey,
} = await import("./external-auth");

const getEnvMock = envModule.getOpenWebUiEnv as unknown as ReturnType<
  typeof vi.fn
>;
const findFirstMock = (
  prismaModule.prisma as unknown as {
    user: { findFirst: ReturnType<typeof vi.fn> };
  }
).user.findFirst;
const permissionMock =
  guardsModule.userHasPermissionById as unknown as ReturnType<typeof vi.fn>;
const brandScopeMock =
  brandScopeModule.buildBrandScopeRequestContext as unknown as ReturnType<
    typeof vi.fn
  >;

const SECRET = "shared-secret-for-tests";
const PERMISSIONS = { sales: ["view"] as ["view"] };

function baseEnv(overrides: Record<string, unknown> = {}) {
  return {
    OPENWEBUI_SHARED_SECRET: SECRET,
    OPENWEBUI_USER_EMAIL_HEADER: "x-openwebui-user-email",
    OPENWEBUI_TASK_HEADER: "x-openwebui-task",
    OPENWEBUI_CHAT_ID_HEADER: "x-openwebui-chat-id",
    OPENWEBUI_ORIGIN: [],
    OPENWEBUI_ASK_TIMEOUT_MS: 90_000,
    PUBLIC_BASE_URL: undefined,
    ...overrides,
  };
}

function makeRequest(headers: Record<string, string>) {
  return new Request("http://test.local/api/openai/v1/chat/completions", {
    method: "POST",
    headers,
  });
}

const dbUser = {
  id: "user-1",
  email: "analyst@phc.cy",
  name: "Analyst",
  role: "analyticsViewer",
  banned: false,
  banExpires: null,
};

beforeEach(() => {
  getEnvMock.mockReturnValue(baseEnv());
  findFirstMock.mockResolvedValue(dbUser);
  permissionMock.mockResolvedValue(true);
  brandScopeMock.mockImplementation(async () => {
    const requestContext = new RequestContext();
    requestContext.set(BRAND_SCOPE_RUNTIME_KEY, ["kfc"]);
    return { requestContext, brands: [{ alias: "kfc", name: "KFC" }] };
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("authenticateExternalUser", () => {
  it("returns 503 when the bridge secret is not configured", async () => {
    getEnvMock.mockReturnValue(baseEnv({ OPENWEBUI_SHARED_SECRET: undefined }));

    await expect(
      authenticateExternalUser(
        makeRequest({ authorization: `Bearer ${SECRET}` }),
        { permissions: PERMISSIONS },
      ),
    ).rejects.toMatchObject({ status: 503, code: "not_configured" });
  });

  it("returns 401 without a bearer header", async () => {
    await expect(
      authenticateExternalUser(makeRequest({}), { permissions: PERMISSIONS }),
    ).rejects.toMatchObject({ status: 401, code: "missing_api_key" });
  });

  it("returns 401 for a token that is neither the secret nor a user token", async () => {
    await expect(
      authenticateExternalUser(makeRequest({ authorization: "Bearer nope" }), {
        permissions: PERMISSIONS,
      }),
    ).rejects.toMatchObject({ status: 401, code: "invalid_api_key" });
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("returns 401 in shared-secret mode when the email header is missing", async () => {
    await expect(
      authenticateExternalUser(
        makeRequest({ authorization: `Bearer ${SECRET}` }),
        { permissions: PERMISSIONS },
      ),
    ).rejects.toMatchObject({ status: 401, code: "missing_user_header" });
  });

  it("returns 403 for an unknown email", async () => {
    findFirstMock.mockResolvedValue(null);

    await expect(
      authenticateExternalUser(
        makeRequest({
          authorization: `Bearer ${SECRET}`,
          "x-openwebui-user-email": "nobody@phc.cy",
        }),
        { permissions: PERMISSIONS },
      ),
    ).rejects.toMatchObject({ status: 403, code: "unknown_user" });
  });

  it("returns 403 for a banned user", async () => {
    findFirstMock.mockResolvedValue({ ...dbUser, banned: true });

    await expect(
      authenticateExternalUser(
        makeRequest({
          authorization: `Bearer ${SECRET}`,
          "x-openwebui-user-email": dbUser.email,
        }),
        { permissions: PERMISSIONS },
      ),
    ).rejects.toMatchObject({ status: 403, code: "user_banned" });
  });

  it("returns 403 when the user lacks the permission", async () => {
    permissionMock.mockResolvedValue(false);

    await expect(
      authenticateExternalUser(
        makeRequest({
          authorization: `Bearer ${SECRET}`,
          "x-openwebui-user-email": dbUser.email,
        }),
        { permissions: PERMISSIONS },
      ),
    ).rejects.toMatchObject({ status: 403, code: "insufficient_permissions" });
    expect(permissionMock).toHaveBeenCalledWith("user-1", PERMISSIONS);
  });

  it("resolves the user, brand scope and channel in shared-secret mode", async () => {
    const caller = await authenticateExternalUser(
      makeRequest({
        authorization: `Bearer ${SECRET}`,
        "x-openwebui-user-email": "Analyst@PHC.cy",
        "x-openwebui-chat-id": "chat-1",
        "x-openwebui-task": "title_generation",
      }),
      { permissions: PERMISSIONS },
    );

    expect(caller.mode).toBe("shared-secret");
    expect(caller.user).toEqual({
      id: "user-1",
      email: "analyst@phc.cy",
      name: "Analyst",
      role: "analyticsViewer",
    });
    expect(caller.brands).toEqual([{ alias: "kfc", name: "KFC" }]);
    expect(caller.requestContext.get(BRAND_SCOPE_RUNTIME_KEY)).toEqual(["kfc"]);
    expect(caller.requestContext.get(CHANNEL_RUNTIME_KEY)).toBe("openwebui");
    expect(caller.headers).toEqual({
      email: "Analyst@PHC.cy",
      chatId: "chat-1",
      task: "title_generation",
    });
    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: "Analyst@PHC.cy", mode: "insensitive" } },
      }),
    );
    expect(brandScopeMock).toHaveBeenCalledWith({
      id: "user-1",
      role: "analyticsViewer",
    });
  });

  it("uses the token's email and ignores the header in user-token mode", async () => {
    const token = signUserToken(SECRET, dbUser.email);

    const caller = await authenticateExternalUser(
      makeRequest({
        authorization: `Bearer ${token}`,
        "x-openwebui-user-email": "someone-else@phc.cy",
      }),
      { permissions: PERMISSIONS, channel: "openwebui" },
    );

    expect(caller.mode).toBe("user-token");
    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: dbUser.email, mode: "insensitive" } },
      }),
    );
  });
});

describe("requireExternalKey", () => {
  it("accepts the shared secret and a valid user token, rejects others", () => {
    expect(() =>
      requireExternalKey(makeRequest({ authorization: `Bearer ${SECRET}` })),
    ).not.toThrow();
    expect(() =>
      requireExternalKey(
        makeRequest({
          authorization: `Bearer ${signUserToken(SECRET, "a@b.cy")}`,
        }),
      ),
    ).not.toThrow();
    expect(() =>
      requireExternalKey(makeRequest({ authorization: "Bearer wrong" })),
    ).toThrow(ExternalApiError);
  });
});

describe("externalErrorResponse", () => {
  it("renders ExternalApiError in the OpenAI error shape", async () => {
    const response = externalErrorResponse(
      new ExternalApiError(401, "invalid_api_key", "Invalid bearer token."),
      { "Access-Control-Allow-Origin": "https://chat.example" },
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://chat.example",
    );
    await expect(response.json()).resolves.toEqual({
      error: {
        message: "Invalid bearer token.",
        type: "authentication_error",
        code: "invalid_api_key",
      },
    });
  });

  it("hides unknown errors behind a 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = externalErrorResponse(new Error("db down"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "server_error", message: "Internal server error" },
    });
  });
});
