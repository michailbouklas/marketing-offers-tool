import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/auth-guards", () => ({
  requireAuthenticatedApiUser: vi.fn(),
  getAuthenticatedUserRole: vi.fn(),
}));

vi.mock("$lib/services/presence/presence-registry.server", () => ({
  upsertTab: vi.fn(),
  removeTab: vi.fn(),
}));

const authModule = await import("$lib/server/auth-guards");
const registryModule =
  await import("$lib/services/presence/presence-registry.server");
const { POST } = await import("./+server");

const requireApiMock =
  authModule.requireAuthenticatedApiUser as unknown as ReturnType<typeof vi.fn>;
const roleMock = authModule.getAuthenticatedUserRole as unknown as ReturnType<
  typeof vi.fn
>;
const upsertMock = registryModule.upsertTab as unknown as ReturnType<
  typeof vi.fn
>;
const removeMock = registryModule.removeTab as unknown as ReturnType<
  typeof vi.fn
>;

const TAB_ID = "2f1c8f0e-6a3b-4c1d-9e2f-0a1b2c3d4e5f";

function makeEvent(body: string) {
  return {
    request: new Request("http://test.local/api/presence", {
      method: "POST",
      body,
    }),
  } as unknown as Parameters<typeof POST>[0];
}

function heartbeat(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: "beat",
    tabId: TAB_ID,
    path: "/aggregator-kpis?period=7d",
    title: "Aggregator KPIs",
    visible: true,
    ...overrides,
  });
}

beforeEach(() => {
  requireApiMock.mockReturnValue({
    session: {},
    user: { id: "user-1", name: "Alice", email: "alice@example.com" },
  });
  roleMock.mockResolvedValue("superUser");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/presence", () => {
  it("returns 401 when unauthenticated", async () => {
    requireApiMock.mockImplementation(() => {
      throw { status: 401 };
    });
    await expect(POST(makeEvent(heartbeat()))).rejects.toMatchObject({
      status: 401,
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("returns 400 on malformed JSON", async () => {
    await expect(POST(makeEvent("{not json"))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("returns 400 on an invalid heartbeat", async () => {
    for (const bad of [
      heartbeat({ tabId: "not-a-uuid" }),
      heartbeat({ path: "https://evil.example/" }),
      heartbeat({ path: `/${"x".repeat(600)}` }),
      heartbeat({ type: "other" }),
    ]) {
      await expect(POST(makeEvent(bad))).rejects.toMatchObject({
        status: 400,
      });
    }
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("upserts with identity from the session, never the body", async () => {
    const response = await POST(
      makeEvent(heartbeat({ userId: "someone-else", name: "Mallory" })),
    );

    expect(response.status).toBe(204);
    expect(upsertMock).toHaveBeenCalledWith(
      {
        id: "user-1",
        name: "Alice",
        email: "alice@example.com",
        role: "superUser",
      },
      expect.objectContaining({
        tabId: TAB_ID,
        path: "/aggregator-kpis?period=7d",
        visible: true,
      }),
    );
  });

  it("removes the tab on leave", async () => {
    const response = await POST(makeEvent(heartbeat({ type: "leave" })));

    expect(response.status).toBe(204);
    expect(removeMock).toHaveBeenCalledWith("user-1", TAB_ID);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
