import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/auth-guards", () => ({
  requireAuthenticatedApiUser: vi.fn(),
  getAuthenticatedUserRole: vi.fn(),
}));

vi.mock("$lib/services/presence/presence-registry.server", () => ({
  upsertTab: vi.fn(),
  removeTab: vi.fn(),
}));

vi.mock("$lib/services/page-views/page-view-recorder.server", () => ({
  recordPageViewBeat: vi.fn(),
  recordPageViewLeave: vi.fn(),
}));

const authModule = await import("$lib/server/auth-guards");
const registryModule =
  await import("$lib/services/presence/presence-registry.server");
const recorderModule =
  await import("$lib/services/page-views/page-view-recorder.server");
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
const beatMock = recorderModule.recordPageViewBeat as unknown as ReturnType<
  typeof vi.fn
>;
const leaveMock = recorderModule.recordPageViewLeave as unknown as ReturnType<
  typeof vi.fn
>;

const TAB_ID = "2f1c8f0e-6a3b-4c1d-9e2f-0a1b2c3d4e5f";
const VIEW_ID = "7d3e2b1a-0c9f-4e8d-a7b6-5c4d3e2f1a0b";

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
    viewId: VIEW_ID,
    routeId: "/aggregator-kpis",
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

  it("persists the page view with identity from the session", async () => {
    await POST(makeEvent(heartbeat({ visible: false })));

    expect(beatMock).toHaveBeenCalledWith({
      userId: "user-1",
      viewId: VIEW_ID,
      tabId: TAB_ID,
      routeId: "/aggregator-kpis",
      path: "/aggregator-kpis?period=7d",
      title: "Aggregator KPIs",
      visible: false,
    });
    expect(leaveMock).not.toHaveBeenCalled();
  });

  it("closes out the page view on leave", async () => {
    await POST(makeEvent(heartbeat({ type: "leave" })));

    expect(leaveMock).toHaveBeenCalledWith("user-1", VIEW_ID);
    expect(beatMock).not.toHaveBeenCalled();
  });

  it("still returns 204 and updates the live view when persistence fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    beatMock.mockRejectedValueOnce(new Error("db down"));

    const response = await POST(makeEvent(heartbeat()));

    expect(response.status).toBe(204);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("rejects heartbeats without a valid viewId or routeId", async () => {
    for (const bad of [
      heartbeat({ viewId: undefined }),
      heartbeat({ viewId: "nope" }),
      heartbeat({ routeId: "no-leading-slash" }),
    ]) {
      await expect(POST(makeEvent(bad))).rejects.toMatchObject({
        status: 400,
      });
    }
    expect(beatMock).not.toHaveBeenCalled();
  });

  it("accepts a null routeId (no matching route)", async () => {
    const response = await POST(makeEvent(heartbeat({ routeId: null })));
    expect(response.status).toBe(204);
    expect(beatMock).toHaveBeenCalledWith(
      expect.objectContaining({ routeId: null }),
    );
  });
});
