import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ text: "", generate: vi.fn() }));

vi.mock("@mastra/core/agent", () => ({
  Agent: class {
    async generate(messages: unknown) {
      h.generate(messages);
      return { text: h.text };
    }
  },
}));
vi.mock("$lib/server/mastra/env", () => ({
  getChatFollowUpsEnv: () => ({ CHAT_FOLLOW_UPS_MODEL: "openai/test-model" }),
}));

const { parseFollowUps, suggestFollowUps } =
  await import("./chat-follow-ups.server");

describe("parseFollowUps", () => {
  it("strips bullets, numbering and quotes, and keeps three", () => {
    expect(
      parseFollowUps(
        '1. How did KFC do?\n- "What about Wolt?"\n\n* Top items last week?\n4) A fourth one?',
      ),
    ).toEqual(["How did KFC do?", "What about Wolt?", "Top items last week?"]);
  });

  it("drops duplicates, blanks and over-long lines", () => {
    expect(parseFollowUps(`Same?\nSame?\n${"x".repeat(200)}\n   `)).toEqual([
      "Same?",
    ]);
  });
});

describe("suggestFollowUps", () => {
  it("sends the exchange with the assistant's label and parses the reply", async () => {
    h.text = "One?\nTwo?\nThree?";
    const out = await suggestFollowUps({
      agentId: "sales-agent",
      question: "Net sales yesterday?",
      answer: "€1,000.00",
    });
    expect(out).toEqual(["One?", "Two?", "Three?"]);
    const content = h.generate.mock.calls[0][0][0].content as string;
    expect(content).toContain("Sales Assistant");
    expect(content).toContain("Net sales yesterday?");
    expect(content).toContain("€1,000.00");
  });
});
