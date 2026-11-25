import { beforeEach, describe, expect, it, vi } from "vitest";

const { authorizeAgent, saveChatFeedback } = vi.hoisted(() => ({
  authorizeAgent: vi.fn(),
  saveChatFeedback: vi.fn(),
}));
vi.mock("$lib/server/chat-thread", () => ({ authorizeAgent }));
vi.mock("$lib/services/chat-usage.server", () => ({ saveChatFeedback }));

import { POST } from "./+server";

const valid = {
  agentId: "sales-agent",
  sessionKey: "3f0c1a52-8f0e-4c0b-9d59-0d7f6f2f7a11",
  messageId: "msg-1",
  rating: -1,
  reason: "  wrong store  ",
};

function post(body: unknown) {
  const request = new Request("http://localhost/api/ai/chat/feedback", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return POST({ request } as never);
}

describe("POST /api/ai/chat/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeAgent.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("saves the rating under the authorised caller", async () => {
    const response = await post(valid);

    expect(response.status).toBe(204);
    expect(authorizeAgent).toHaveBeenCalledWith(
      expect.anything(),
      "sales-agent",
    );
    expect(saveChatFeedback).toHaveBeenCalledWith("user-1", {
      ...valid,
      reason: "wrong store",
    });
  });

  it.each([
    { ...valid, rating: 0 },
    { ...valid, rating: 5 },
    { ...valid, sessionKey: "not-a-uuid" },
    { ...valid, messageId: "" },
    null,
  ])("rejects an invalid body %#", async (body) => {
    await expect(post(body)).rejects.toMatchObject({ status: 400 });
    expect(saveChatFeedback).not.toHaveBeenCalled();
  });

  it("saves nothing when the caller may not use the agent", async () => {
    authorizeAgent.mockRejectedValue({ status: 403 });

    await expect(post(valid)).rejects.toMatchObject({ status: 403 });
    expect(saveChatFeedback).not.toHaveBeenCalled();
  });
});
