import { beforeEach, describe, expect, it, vi } from "vitest";

const { authorizeAgent, createShare, revokeShare, getThreadById } = vi.hoisted(
  () => ({
    authorizeAgent: vi.fn(),
    createShare: vi.fn(),
    revokeShare: vi.fn(),
    getThreadById: vi.fn(),
  }),
);
vi.mock("$lib/server/chat-thread", () => ({
  authorizeAgent,
  threadIdFor: (agentId: string, userId: string, key: string) =>
    `${agentId}:${userId}:${key}`,
}));
vi.mock("$lib/server/auth-guards", () => ({
  getAuthenticatedUserRole: async () => "user",
}));
vi.mock("$lib/server/mastra", () => ({
  getMastra: () => ({
    getAgentById: () => ({ getMemory: async () => ({ getThreadById }) }),
  }),
}));
vi.mock("$lib/services/chat-share.server", () => ({
  createShare,
  revokeShare,
  isMissingTable: (cause: { code?: string }) => cause?.code === "P2021",
}));

import { DELETE, POST } from "./+server";

const sessionKey = "3f0c1a52-8f0e-4c0b-9d59-0d7f6f2f7a11";
const missingTable = Object.assign(new Error("no table"), { code: "P2021" });

function call(handler: typeof POST, body: unknown) {
  const request = new Request("http://localhost/api/ai/chat/share", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return handler({ request } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizeAgent.mockResolvedValue({ user: { id: "user-1" } });
  getThreadById.mockResolvedValue({ resourceId: "user-1" });
  createShare.mockResolvedValue({ id: "share-1" });
  revokeShare.mockResolvedValue(undefined);
});

describe("POST /api/ai/chat/share", () => {
  it("shares the caller's own conversation", async () => {
    const response = await call(POST, { agentId: "sales-agent", sessionKey });

    expect(await response.json()).toEqual({ id: "share-1" });
    expect(getThreadById).toHaveBeenCalledWith({
      threadId: `sales-agent:user-1:${sessionKey}`,
    });
    expect(createShare).toHaveBeenCalledWith(
      { id: "user-1", role: "user" },
      "sales-agent",
      sessionKey,
    );
  });

  it.each(["google-analytics-agent", "management-accounts-agent"])(
    "refuses %s",
    async (agentId) => {
      await expect(call(POST, { agentId, sessionKey })).rejects.toMatchObject({
        status: 400,
      });
      expect(createShare).not.toHaveBeenCalled();
    },
  );

  it("rejects an invalid body", async () => {
    await expect(
      call(POST, { agentId: "sales-agent", sessionKey: "nope" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("answers 404 for a conversation the caller does not have", async () => {
    getThreadById.mockResolvedValue(null);

    await expect(
      call(POST, { agentId: "sales-agent", sessionKey }),
    ).rejects.toMatchObject({ status: 404 });
    expect(createShare).not.toHaveBeenCalled();
  });

  it("answers 503, not a crash, when the table is missing", async () => {
    createShare.mockRejectedValue(missingTable);

    await expect(
      call(POST, { agentId: "sales-agent", sessionKey }),
    ).rejects.toMatchObject({ status: 503 });
  });
});

describe("DELETE /api/ai/chat/share", () => {
  it("revokes only the caller's own share", async () => {
    const response = await call(DELETE, { agentId: "sales-agent", sessionKey });

    expect(response.status).toBe(204);
    expect(revokeShare).toHaveBeenCalledWith(
      "user-1",
      "sales-agent",
      sessionKey,
    );
  });
});
