import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/auth-guards", () => ({
  requireAuthenticatedApiUser: vi.fn(),
  requireApiPermission: vi.fn(),
  getAuthenticatedUserRole: vi.fn(),
}));

vi.mock("$lib/server/mastra/chat-registry", () => ({
  chatAgents: {
    "open-agent": {},
    "gated-agent": { permissions: { sales: ["view"] } },
    "role-agent": { roles: ["superUser"] },
  },
}));

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    chatPrompt: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

const authModule = await import("$lib/server/auth-guards");
const { prisma } = await import("$lib/server/prisma");
const { GET, POST, PATCH, DELETE } = await import("./+server");

type Mock = ReturnType<typeof vi.fn>;
const requireUserMock =
  authModule.requireAuthenticatedApiUser as unknown as Mock;
const requirePermissionMock =
  authModule.requireApiPermission as unknown as Mock;
const roleMock = authModule.getAuthenticatedUserRole as unknown as Mock;
const db = prisma.chatPrompt as unknown as Record<
  "findMany" | "count" | "create" | "updateMany" | "deleteMany",
  Mock
>;

const caller = { session: {}, user: { id: "user-1" } };

function makeEvent(method: string, search = "", body?: unknown) {
  const url = new URL(`http://test.local/api/ai/chat/prompts${search}`);
  return {
    url,
    request: new Request(url, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  requireUserMock.mockReturnValue(caller);
  requirePermissionMock.mockResolvedValue(caller);
  roleMock.mockResolvedValue("user");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("agent authorisation", () => {
  it("rejects an unknown agent", async () => {
    await expect(GET(makeEvent("GET", "?agentId=nope"))).rejects.toMatchObject({
      status: 400,
    });
    expect(db.findMany).not.toHaveBeenCalled();
  });

  it("applies the agent's permission gate", async () => {
    requirePermissionMock.mockImplementation(() => {
      throw { status: 403 };
    });
    await expect(
      POST(makeEvent("POST", "", { agentId: "gated-agent", text: "hi" })),
    ).rejects.toMatchObject({ status: 403 });
    expect(requirePermissionMock).toHaveBeenCalledWith(expect.anything(), {
      sales: ["view"],
    });
    expect(db.create).not.toHaveBeenCalled();
  });

  it("applies the agent's role gate", async () => {
    await expect(
      GET(makeEvent("GET", "?agentId=role-agent")),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("GET", () => {
  it("lists published prompts plus the caller's own, without owner ids", async () => {
    db.findMany.mockResolvedValue([
      { id: 1, text: "team", published: true, userId: "someone-else" },
      { id: 2, text: "own", published: false, userId: "user-1" },
    ]);

    const response = await GET(makeEvent("GET", "?agentId=open-agent"));

    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          agentId: "open-agent",
          OR: [{ published: true }, { userId: "user-1" }],
        },
      }),
    );
    expect(await response.json()).toEqual({
      prompts: [
        { id: 1, text: "team", published: true, mine: false },
        { id: 2, text: "own", published: false, mine: true },
      ],
      canPublish: false,
    });
  });

  it("returns an empty list when the table does not exist yet", async () => {
    db.findMany.mockRejectedValue(
      Object.assign(new Error("no table"), { code: "P2021" }),
    );

    const response = await GET(makeEvent("GET", "?agentId=open-agent"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ prompts: [], canPublish: false });
  });
});

describe("POST", () => {
  it("trims the text and stores it under the session user", async () => {
    db.count.mockResolvedValue(0);
    db.create.mockResolvedValue({ id: 7, text: "hello", published: false });

    const response = await POST(
      makeEvent("POST", "", {
        agentId: "open-agent",
        text: "  hello  ",
        userId: "someone-else",
        published: true,
      }),
    );

    expect(response.status).toBe(201);
    expect(db.create).toHaveBeenCalledWith({
      data: { agentId: "open-agent", userId: "user-1", text: "hello" },
    });
  });

  it("rejects empty, over-long and malformed input", async () => {
    for (const bad of [
      { agentId: "open-agent", text: "   " },
      { agentId: "open-agent", text: "x".repeat(501) },
      { text: "no agent" },
      undefined,
    ]) {
      await expect(POST(makeEvent("POST", "", bad))).rejects.toMatchObject({
        status: 400,
      });
    }
    expect(db.create).not.toHaveBeenCalled();
  });

  it("refuses the 21st prompt", async () => {
    db.count.mockResolvedValue(20);

    await expect(
      POST(makeEvent("POST", "", { agentId: "open-agent", text: "one more" })),
    ).rejects.toMatchObject({ status: 409 });
    expect(db.count).toHaveBeenCalledWith({
      where: { agentId: "open-agent", userId: "user-1" },
    });
    expect(db.create).not.toHaveBeenCalled();
  });
});

describe("PATCH", () => {
  const body = { agentId: "open-agent", id: 3, published: true };

  it("is forbidden for non-superUsers", async () => {
    await expect(PATCH(makeEvent("PATCH", "", body))).rejects.toMatchObject({
      status: 403,
    });
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it("lets a superUser publish only their own prompt", async () => {
    roleMock.mockResolvedValue("superUser");
    db.updateMany.mockResolvedValue({ count: 1 });

    const response = await PATCH(makeEvent("PATCH", "", body));

    expect(response.status).toBe(204);
    expect(db.updateMany).toHaveBeenCalledWith({
      where: { id: 3, agentId: "open-agent", userId: "user-1" },
      data: { published: true },
    });

    db.updateMany.mockResolvedValue({ count: 0 });
    await expect(PATCH(makeEvent("PATCH", "", body))).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("DELETE", () => {
  const search = "?agentId=open-agent&id=3";

  it("limits a regular user to their own prompts", async () => {
    db.deleteMany.mockResolvedValue({ count: 0 });

    await expect(DELETE(makeEvent("DELETE", search))).rejects.toMatchObject({
      status: 404,
    });
    expect(db.deleteMany).toHaveBeenCalledWith({
      where: { id: 3, agentId: "open-agent", OR: [{ userId: "user-1" }] },
    });
  });

  it("lets a superUser delete any published prompt", async () => {
    roleMock.mockResolvedValue("superUser");
    db.deleteMany.mockResolvedValue({ count: 1 });

    const response = await DELETE(makeEvent("DELETE", search));

    expect(response.status).toBe(204);
    expect(db.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 3,
        agentId: "open-agent",
        OR: [{ userId: "user-1" }, { published: true }],
      },
    });
  });
});
