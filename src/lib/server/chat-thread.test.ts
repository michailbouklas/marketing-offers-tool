import { handleChatStream } from "@mastra/ai-sdk";
import { toAISdkMessages } from "@mastra/ai-sdk/ui";
import { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { createTool } from "@mastra/core/tools";
import { Memory } from "@mastra/memory";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("$lib/server/auth-guards", () => ({}));
vi.mock("$lib/server/mastra/chat-registry", () => ({ chatAgents: {} }));

import { beginRun, truncateThread } from "./chat-thread";

const THREAD = "test-agent:user-1:session-1";
const RESOURCE = "user-1";

/** `toolFirst`: every answer takes two model steps, a tool call then text. */
function setup(toolFirst = false) {
  let call = 0;
  /** While set, the model hangs mid-answer until its request is aborted. */
  let hang = false;
  const memory = new Memory({
    storage: new InMemoryStore(),
    options: { lastMessages: 20, generateTitle: false },
  });
  const agent = new Agent({
    id: "test-agent",
    name: "test-agent",
    instructions: "test",
    memory,
    tools: {
      lookup: createTool({
        id: "lookup",
        description: "test lookup",
        inputSchema: z.object({}),
        execute: async () => ({ rows: 1 }),
      }),
    },
    model: new MockLanguageModelV3({
      doStream: async ({ abortSignal }: { abortSignal?: AbortSignal }) => {
        const text = `answer ${++call}`;
        const callsTool = toolFirst && call % 2 === 1;
        return {
          stream: new ReadableStream({
            async start(controller) {
              controller.enqueue({ type: "stream-start", warnings: [] });
              if (callsTool) {
                controller.enqueue({
                  type: "tool-call",
                  toolCallId: `call-${call}`,
                  toolName: "lookup",
                  input: "{}",
                });
                controller.enqueue({
                  type: "finish",
                  finishReason: { unified: "tool-calls", raw: "tool_calls" },
                  usage: {
                    inputTokens: { total: 1, noCache: 1 },
                    outputTokens: { total: 1, text: 1 },
                  },
                });
                controller.close();
                return;
              }
              controller.enqueue({ type: "text-start", id: "t" });
              controller.enqueue({ type: "text-delta", id: "t", delta: text });
              if (hang) {
                await new Promise((resolve) =>
                  abortSignal?.addEventListener("abort", resolve),
                );
                controller.error(new DOMException("aborted", "AbortError"));
                return;
              }
              controller.enqueue({ type: "text-end", id: "t" });
              controller.enqueue({
                type: "finish",
                finishReason: { unified: "stop", raw: "stop" },
                usage: {
                  inputTokens: { total: 1, noCache: 1 },
                  outputTokens: { total: 1, text: 1 },
                },
              });
              controller.close();
            },
          }),
        };
      },
    } as never),
  });
  const mastra = new Mastra({ agents: { "test-agent": agent }, logger: false });

  /**
   * One chat turn wired like the POST handler. Reads the answer to its end,
   * or with `stop` walks away after the first text like the stop button.
   * Returns the streamed assistant message id.
   */
  async function turn(
    id: string,
    text: string,
    options: { truncateFrom?: string; stop?: boolean } = {},
  ) {
    hang = options.stop ?? false;
    const stream = await handleChatStream({
      mastra,
      agentId: "test-agent",
      version: "v6",
      params: {
        messages: [
          { id, role: "user", parts: [{ type: "text", text }] },
        ] as never,
        maxSteps: 8,
        memory: { thread: THREAD, resource: RESOURCE },
        ...(await beginRun(memory, THREAD, RESOURCE, id, options.truncateFrom)),
      },
    });
    const reader = (
      stream as ReadableStream<{ type: string; messageId?: string }>
    ).getReader();
    let streamedId: string | undefined;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value.type === "start") streamedId = value.messageId;
      if (options.stop && value.type === "text-delta") {
        await reader.cancel();
        break;
      }
    }
    return streamedId;
  }

  async function storedIds() {
    const { messages } = await memory.recall({
      threadId: THREAD,
      resourceId: RESOURCE,
      perPage: false,
    });
    return messages.map((message) => message.id);
  }

  return { memory, turn, storedIds };
}

describe("edit/retry of a stored thread", () => {
  it("without a cut, the abandoned turn stays stored (the bug)", async () => {
    const { turn, storedIds } = setup();
    await turn("u1", "first question");
    await turn("u2", "second question");
    // The client cut its local list at u2 and sent the edit as a new message.
    await turn("u3", "second question, edited");

    const ids = await storedIds();
    expect(ids).toHaveLength(6);
    expect(ids).toContain("u2");
  });

  it("removes the cut message and everything after it", async () => {
    const { turn, storedIds } = setup();
    await turn("u1", "first question");
    await turn("u2", "second question");
    const firstTurn = (await storedIds()).slice(0, 2);

    const answerId = await turn("u3", "second question, edited", {
      truncateFrom: "u2",
    });

    expect(await storedIds()).toEqual([...firstTurn, "u3", answerId]);
  });

  it("removes a turn that was stopped and is saved late", async () => {
    const { turn, storedIds } = setup();
    await turn("u1", "first question");
    const firstTurn = await storedIds();
    await turn("u2", "second question", { stop: true });
    // Nothing of the stopped turn is stored yet, so the cut finds no "u2".
    expect(await storedIds()).toEqual(firstTurn);

    const answerId = await turn("u3", "second question, edited", {
      truncateFrom: "u2",
    });
    // Let the end-of-run callbacks of both runs finish.
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(await storedIds()).toEqual([...firstTurn, "u3", answerId]);
  });

  it("ignores ids that are not in the caller's thread", async () => {
    const { memory, turn, storedIds } = setup();
    await turn("u1", "first question");
    const before = await storedIds();

    await truncateThread(memory, THREAD, RESOURCE, "nope");
    await truncateThread(memory, "other:thread:key", RESOURCE, "u1");

    expect(await storedIds()).toEqual(before);
  });

  // Feedback is keyed by message id, so a rating given on a fresh answer must
  // still match after the conversation is reopened from history.
  it.each([
    ["a plain answer", false],
    ["an answer with a tool step", true],
  ])(
    "streams %s under the id it is recalled with",
    async (_name, toolFirst) => {
      const { memory, turn } = setup(toolFirst);
      const streamedId = await turn("u1", "first question");

      const { messages } = await memory.recall({
        threadId: THREAD,
        resourceId: RESOURCE,
        perPage: false,
      });
      const recalled = toAISdkMessages(messages, { version: "v6" });
      expect(recalled.map((message) => message.id)).toEqual(["u1", streamedId]);
      expect(
        recalled[1].parts.some((part) => part.type === "tool-lookup"),
      ).toBe(toolFirst);
    },
  );
});
