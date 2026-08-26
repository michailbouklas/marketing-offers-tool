import type { ChunkType, MastraModelOutput } from "@mastra/core/stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalApiError } from "./external-api-error";
import {
  chatCompletionRequestSchema,
  openAIJsonResponse,
  openAIStreamResponse,
  toModelMessages,
  toOpenAIFinishReason,
  toOpenAIUsage,
  toolStatusLine,
} from "./openai-compat";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chatCompletionRequestSchema", () => {
  it("accepts the OpenAI shape and defaults stream to false", () => {
    const parsed = chatCompletionRequestSchema.parse({
      model: "sales-agent",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.2,
    });

    expect(parsed.stream).toBe(false);
    expect(parsed.model).toBe("sales-agent");
  });

  it("rejects unknown roles and empty message lists", () => {
    expect(
      chatCompletionRequestSchema.safeParse({
        model: "x",
        messages: [{ role: "tool", content: "x" }],
      }).success,
    ).toBe(false);
    expect(
      chatCompletionRequestSchema.safeParse({ model: "x", messages: [] })
        .success,
    ).toBe(false);
  });
});

describe("toModelMessages", () => {
  it("flattens content parts, drops system/empty messages and keeps order", () => {
    const { messages, lastUser } = toModelMessages([
      { role: "system", content: "ignore me" },
      { role: "user", content: [{ type: "text", text: "first" }] },
      { role: "assistant", content: "reply" },
      { role: "assistant", content: null },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: "x" } },
          { type: "text", text: "second" },
        ],
      },
    ]);

    expect(messages).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "reply" },
      { role: "user", content: "second" },
    ]);
    expect(lastUser).toEqual({ role: "user", content: "second" });
  });

  it("requires the last message to be a non-empty user message", () => {
    expect(() =>
      toModelMessages([
        { role: "user", content: "q" },
        { role: "assistant", content: "a" },
      ]),
    ).toThrow(ExternalApiError);
    expect(() => toModelMessages([{ role: "user", content: "   " }])).toThrow(
      ExternalApiError,
    );
  });

  it("caps history to the most recent 40 messages", () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `m${index}`,
    }));
    // Make the final message a user turn.
    many.push({ role: "user", content: "last" });

    const { messages } = toModelMessages(many);

    expect(messages).toHaveLength(40);
    expect(messages.at(-1)?.content).toBe("last");
  });
});

describe("small mappers", () => {
  it("maps usage and finish reasons", () => {
    expect(toOpenAIUsage({ inputTokens: 10, outputTokens: 5 })).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
    expect(toOpenAIUsage(undefined)).toEqual({
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    });
    expect(toOpenAIFinishReason("length")).toBe("length");
    expect(toOpenAIFinishReason("content-filter")).toBe("content_filter");
    expect(toOpenAIFinishReason("tool-calls")).toBe("stop");
    expect(toOpenAIFinishReason(undefined)).toBe("stop");
  });

  it("only surfaces the SQL tool as a status line", () => {
    expect(toolStatusLine("querySalesSql")).toContain("Querying sales data");
    expect(toolStatusLine("query-sales-sql")).toContain("Querying sales data");
    expect(toolStatusLine("generateExcel")).toBeNull();
  });
});

function chunk(type: string, payload: unknown): ChunkType {
  return { type, runId: "run", from: "AGENT", payload } as unknown as ChunkType;
}

function fakeOutput(
  chunks: ChunkType[],
  extra: Partial<Record<string, unknown>> = {},
) {
  return {
    fullStream: new ReadableStream<ChunkType>({
      start(controller) {
        for (const part of chunks) {
          controller.enqueue(part);
        }
        controller.close();
      },
    }),
    totalUsage: Promise.resolve({ inputTokens: 7, outputTokens: 3 }),
    ...extra,
  } as unknown as MastraModelOutput;
}

async function readSse(response: Response) {
  const text = await response.text();
  const frames = text
    .split("\n\n")
    .filter((frame) => frame.startsWith("data: "))
    .map((frame) => frame.slice("data: ".length));
  const done = frames.at(-1);
  const payloads = frames
    .slice(0, -1)
    .map((frame) => JSON.parse(frame) as Record<string, unknown>);

  return { done, payloads };
}

describe("openAIStreamResponse", () => {
  const envelope = { id: "chatcmpl-1", model: "sales-agent", created: 123 };

  it("encodes text deltas, tool status, finish + usage and [DONE]", async () => {
    const output = fakeOutput([
      chunk("text-delta", { id: "t", text: "Hello" }),
      chunk("tool-call", { toolCallId: "c1", toolName: "querySalesSql" }),
      chunk("tool-result", { toolCallId: "c1", result: {} }),
      chunk("text-delta", { id: "t", text: " world" }),
      chunk("finish", {
        stepResult: { reason: "stop" },
        output: { usage: { inputTokens: 11, outputTokens: 4 } },
      }),
    ]);

    const response = openAIStreamResponse({
      ...envelope,
      output,
      abort: new AbortController(),
    });

    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");

    const { done, payloads } = await readSse(response);

    expect(done).toBe("[DONE]");
    expect(payloads.every((p) => p.object === "chat.completion.chunk")).toBe(
      true,
    );
    expect(payloads.every((p) => p.id === "chatcmpl-1")).toBe(true);

    const deltas = payloads.map(
      (p) => (p.choices as { delta: Record<string, unknown> }[])[0].delta,
    );
    expect(deltas[0]).toEqual({ role: "assistant", content: "" });
    expect(deltas[1]).toEqual({ content: "Hello" });
    expect(deltas[2].content as string).toContain("Querying sales data");
    expect(deltas[3]).toEqual({ content: " world" });

    const last = payloads.at(-1)!;
    expect((last.choices as { finish_reason: string }[])[0].finish_reason).toBe(
      "stop",
    );
    expect(last.usage).toEqual({
      prompt_tokens: 11,
      completion_tokens: 4,
      total_tokens: 15,
    });
  });

  it("terminates cleanly with a friendly line on an error chunk", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const output = fakeOutput([
      chunk("text-delta", { id: "t", text: "Partial" }),
      chunk("error", { error: new Error("boom") }),
    ]);

    const { done, payloads } = await readSse(
      openAIStreamResponse({
        ...envelope,
        output,
        abort: new AbortController(),
      }),
    );

    expect(done).toBe("[DONE]");
    const last = payloads.at(-1)!;
    const choice = (
      last.choices as { delta: { content?: string }; finish_reason: string }[]
    )[0];
    expect(choice.finish_reason).toBe("stop");
    expect(choice.delta.content).toContain("hit an error");
  });

  it("stays silent after the client aborted", async () => {
    const abort = new AbortController();
    const output = fakeOutput([
      chunk("error", { error: new Error("aborted") }),
    ]);
    abort.abort();

    const { done, payloads } = await readSse(
      openAIStreamResponse({ ...envelope, output, abort }),
    );

    expect(done).toBe("[DONE]");
    // Only the opening role chunk — no error line after an abort.
    expect(payloads).toHaveLength(1);
  });
});

describe("openAIJsonResponse", () => {
  it("returns a chat.completion body", async () => {
    const output = {
      text: Promise.resolve("The answer"),
      error: undefined,
      totalUsage: Promise.resolve({ inputTokens: 2, outputTokens: 8 }),
      finishReason: Promise.resolve("stop"),
    } as unknown as MastraModelOutput;

    const response = await openAIJsonResponse({
      id: "chatcmpl-2",
      model: "sales-agent",
      created: 5,
      output,
    });

    await expect(response.json()).resolves.toEqual({
      id: "chatcmpl-2",
      object: "chat.completion",
      created: 5,
      model: "sales-agent",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "The answer" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 2, completion_tokens: 8, total_tokens: 10 },
    });
  });

  it("propagates an agent error", async () => {
    const output = {
      text: Promise.resolve(""),
      error: new Error("model failed"),
    } as unknown as MastraModelOutput;

    await expect(
      openAIJsonResponse({ id: "x", model: "m", created: 1, output }),
    ).rejects.toThrow("model failed");
  });
});
