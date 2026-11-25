import { beforeEach, describe, expect, it, vi } from "vitest";

const { chatShare, authorizeAgent, listScopedBrands, memory } = vi.hoisted(
  () => ({
    chatShare: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    authorizeAgent: vi.fn(),
    listScopedBrands: vi.fn(),
    memory: {
      getThreadById: vi.fn(),
      recall: vi.fn(),
      createThread: vi.fn(),
      saveMessages: vi.fn(),
    },
  }),
);
vi.mock("$lib/server/prisma", () => ({ prisma: { chatShare } }));
vi.mock("$lib/server/chat-thread", () => ({
  authorizeAgent,
  threadIdFor: (agentId: string, userId: string, key: string) =>
    `${agentId}:${userId}:${key}`,
}));
vi.mock("$lib/server/brand-scope.server", () => ({ listScopedBrands }));
vi.mock("$lib/server/auth-guards", () => ({
  getAuthenticatedUserRole: async () => "user",
}));
vi.mock("$lib/server/mastra", () => ({
  getMastra: () => ({
    getAgentById: () => ({ getMemory: async () => memory }),
  }),
}));

import {
  copySharedConversation,
  createShare,
  openShare,
} from "./chat-share.server";

const event = {} as never;
const share = {
  id: "share-1",
  userId: "owner",
  agentId: "sales-agent",
  sessionKey: "key-1",
  brandAliases: ["BK"],
  user: { name: "Olga Owner", role: "user" },
};
const stored = [
  {
    id: "m1",
    role: "user",
    createdAt: new Date("2026-11-01T10:00:00Z"),
    threadId: "sales-agent:owner:key-1",
    resourceId: "owner",
    content: { format: 2, parts: [{ type: "text", text: "revenue?" }] },
  },
];

// Brands by user id; the owner gained PH after sharing.
function brands(byUser: Record<string, string[]>) {
  listScopedBrands.mockImplementation(async ({ id }: { id: string }) =>
    (byUser[id] ?? []).map((alias) => ({ alias, name: alias })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  chatShare.findUnique.mockResolvedValue(share);
  authorizeAgent.mockResolvedValue({ user: { id: "viewer" } });
  memory.getThreadById.mockResolvedValue({ title: "Revenue" });
  memory.recall.mockResolvedValue({ messages: stored });
  brands({ owner: ["BK", "PH"], viewer: ["BK", "PH"] });
});

describe("openShare", () => {
  it("returns the owner's whole thread to a viewer whose scope covers it", async () => {
    const shared = await openShare(event, "share-1");

    expect(authorizeAgent).toHaveBeenCalledWith(event, "sales-agent");
    expect(memory.recall).toHaveBeenCalledWith({
      threadId: "sales-agent:owner:key-1",
      resourceId: "owner",
      perPage: false,
    });
    expect(shared).toMatchObject({
      isOwner: false,
      ownerName: "Olga Owner",
      title: "Revenue",
    });
    expect(shared.messages).toHaveLength(1);
  });

  it("refuses a viewer missing a brand the owner gained after sharing", async () => {
    brands({ owner: ["BK", "PH"], viewer: ["BK"] });

    await expect(openShare(event, "share-1")).rejects.toMatchObject({
      status: 403,
    });
    expect(memory.recall).not.toHaveBeenCalled();
  });

  it("refuses a viewer missing a brand stored on the share", async () => {
    brands({ owner: [], viewer: ["PH"] });

    await expect(openShare(event, "share-1")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("does not open anything when the viewer may not use the agent", async () => {
    authorizeAgent.mockRejectedValue({ status: 403 });

    await expect(openShare(event, "share-1")).rejects.toMatchObject({
      status: 403,
    });
    expect(memory.recall).not.toHaveBeenCalled();
  });

  it("lets the owner in without comparing brands", async () => {
    authorizeAgent.mockResolvedValue({ user: { id: "owner" } });
    brands({});

    expect((await openShare(event, "share-1")).isOwner).toBe(true);
    expect(listScopedBrands).not.toHaveBeenCalled();
  });

  it.each([
    ["a revoked share", () => chatShare.findUnique.mockResolvedValue(null)],
    [
      "a missing ChatShare table",
      () =>
        chatShare.findUnique.mockRejectedValue(
          Object.assign(new Error("no table"), { code: "P2021" }),
        ),
    ],
    [
      "a deleted conversation",
      () => memory.getThreadById.mockResolvedValue(null),
    ],
  ])("answers 404 for %s", async (_name, arrange) => {
    arrange();

    await expect(openShare(event, "share-1")).rejects.toMatchObject({
      status: 404,
    });
    expect(memory.recall).not.toHaveBeenCalled();
  });
});

describe("copySharedConversation", () => {
  it("copies the messages into a new thread of the viewer", async () => {
    const url = await copySharedConversation(event, "share-1");

    const sessionKey = /^\/sales\/chat\?session=([0-9a-f-]{36})$/.exec(
      url,
    )?.[1];
    expect(sessionKey).toBeDefined();
    const threadId = `sales-agent:viewer:${sessionKey}`;
    expect(memory.createThread).toHaveBeenCalledWith({
      threadId,
      resourceId: "viewer",
      title: "Copy of Revenue",
    });

    const [{ messages }] = memory.saveMessages.mock.calls[0];
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      threadId,
      resourceId: "viewer",
      role: "user",
      createdAt: stored[0].createdAt,
    });
    // A reused id would move the owner's message into the copy.
    expect(messages[0].id).not.toBe("m1");
  });

  it("copies nothing when the viewer may not open the share", async () => {
    brands({ owner: ["BK"], viewer: [] });

    await expect(
      copySharedConversation(event, "share-1"),
    ).rejects.toMatchObject({ status: 403 });
    expect(memory.createThread).not.toHaveBeenCalled();
  });
});

describe("createShare", () => {
  it("stores the owner's brand aliases for a brand-scoped agent", async () => {
    chatShare.upsert.mockResolvedValue({ id: "share-1" });

    await createShare({ id: "owner", role: "user" }, "sales-agent", "key-1");

    expect(chatShare.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          userId: "owner",
          agentId: "sales-agent",
          sessionKey: "key-1",
          brandAliases: ["BK", "PH"],
        },
        update: {},
      }),
    );
  });

  it("stores no aliases for an agent without a brand scope", async () => {
    chatShare.upsert.mockResolvedValue({ id: "share-2" });

    await createShare({ id: "owner", role: "user" }, "invoices-agent", "key-1");

    expect(listScopedBrands).not.toHaveBeenCalled();
    expect(chatShare.upsert.mock.calls[0][0].create.brandAliases).toEqual([]);
  });
});
