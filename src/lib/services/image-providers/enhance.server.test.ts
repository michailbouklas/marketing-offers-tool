import { describe, expect, it } from "vitest";
import { PromptEnhancer, PromptEnhancerError } from "./enhance.server";

interface RecordedCall {
  url: string;
  init: RequestInit;
}

function recorderFetch(
  calls: RecordedCall[],
  handler: (url: string, init: RequestInit) => Promise<Response> | Response,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const requestInit = init ?? {};
    calls.push({ url, init: requestInit });
    return handler(url, requestInit);
  }) as unknown as typeof fetch;
}

function chatResponse(jsonContent: object, status = 200): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(jsonContent) } }],
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

describe("PromptEnhancer", () => {
  it("returns clarifyingQuestions with examples when the model asks for clarification", async () => {
    const calls: RecordedCall[] = [];
    const enhancer = new PromptEnhancer({
      apiKey: "sk-test",
      fetch: recorderFetch(calls, () =>
        chatResponse({
          clarifyingQuestions: [
            { question: "What lighting?", example: "warm sunset light" },
            { question: "Indoor or outdoor?", example: "a cozy living room" },
          ],
        }),
      ),
    });

    const result = await enhancer.enhance("a cat");

    expect(result.clarifyingQuestions).toEqual([
      { question: "What lighting?", example: "warm sunset light" },
      { question: "Indoor or outdoor?", example: "a cozy living room" },
    ]);
    expect(result.enhancedPrompt).toBeUndefined();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[1].content).toBe("a cat");
  });

  it("returns a critique alongside questions and forwards brand guidelines", async () => {
    const calls: RecordedCall[] = [];
    const enhancer = new PromptEnhancer({
      apiKey: "sk-test",
      fetch: recorderFetch(calls, () =>
        chatResponse({
          critique: "Too generic — no subject, palette, or composition.",
          clarifyingQuestions: [
            { question: "Which brand color leads?", example: "navy blue" },
          ],
        }),
      ),
    });

    const result = await enhancer.enhance("a banner", "Primary color: navy.");

    expect(result.critique).toBe(
      "Too generic — no subject, palette, or composition.",
    );
    expect(result.clarifyingQuestions).toEqual([
      { question: "Which brand color leads?", example: "navy blue" },
    ]);

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.messages[1].content).toContain("Primary color: navy.");
    expect(body.messages[1].content).toContain("a banner");
  });

  it("normalizes plain-string clarifyingQuestions into objects", async () => {
    const enhancer = new PromptEnhancer({
      apiKey: "sk-test",
      fetch: recorderFetch([], () =>
        chatResponse({
          clarifyingQuestions: ["What lighting?", "Indoor or outdoor?"],
        }),
      ),
    });

    const result = await enhancer.enhance("a cat");

    expect(result.clarifyingQuestions).toEqual([
      { question: "What lighting?" },
      { question: "Indoor or outdoor?" },
    ]);
  });

  it("sends reference images as multimodal content alongside the text", async () => {
    const calls: RecordedCall[] = [];
    const enhancer = new PromptEnhancer({
      apiKey: "sk-test",
      fetch: recorderFetch(calls, () =>
        chatResponse({ enhancedPrompt: "taco in a box on an office desk" }),
      ),
    });

    const result = await enhancer.enhance("put it in a box", undefined, [
      "data:image/png;base64,AAA",
      "data:image/webp;base64,BBB",
    ]);

    expect(result.enhancedPrompt).toBe("taco in a box on an office desk");

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages[1].content).toEqual([
      { type: "text", text: "put it in a box" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
      { type: "image_url", image_url: { url: "data:image/webp;base64,BBB" } },
    ]);
  });

  it("keeps content a plain string when no reference images are passed", async () => {
    const calls: RecordedCall[] = [];
    const enhancer = new PromptEnhancer({
      apiKey: "sk-test",
      fetch: recorderFetch(calls, () => chatResponse({ enhancedPrompt: "ok" })),
    });

    await enhancer.enhance("a cat", undefined, []);

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.messages[1].content).toBe("a cat");
  });

  it("returns enhancedPrompt when the model rewrites the prompt", async () => {
    const calls: RecordedCall[] = [];
    const enhancer = new PromptEnhancer({
      apiKey: "sk-test",
      fetch: recorderFetch(calls, () =>
        chatResponse({
          enhancedPrompt:
            "A photorealistic studio shot of a black cat, soft natural light, shallow depth of field",
        }),
      ),
    });

    const result = await enhancer.enhance(
      "a black cat in a sunny studio with a soft natural light",
    );

    expect(result.enhancedPrompt).toMatch(/photorealistic studio/);
    expect(result.clarifyingQuestions).toBeUndefined();
  });

  it("throws PromptEnhancerError on 4xx/5xx responses", async () => {
    const enhancer = new PromptEnhancer({
      apiKey: "sk-test",
      fetch: recorderFetch(
        [],
        () =>
          new Response(JSON.stringify({ error: { message: "rate limited" } }), {
            status: 429,
            headers: { "content-type": "application/json" },
          }),
      ),
    });

    await expect(enhancer.enhance("hi")).rejects.toBeInstanceOf(
      PromptEnhancerError,
    );
  });

  it("throws when the JSON content is malformed", async () => {
    const enhancer = new PromptEnhancer({
      apiKey: "sk-test",
      fetch: recorderFetch(
        [],
        () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: "not-json" } }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    });

    await expect(enhancer.enhance("hi")).rejects.toBeInstanceOf(
      PromptEnhancerError,
    );
  });

  it("throws when neither field is present in the model output", async () => {
    const enhancer = new PromptEnhancer({
      apiKey: "sk-test",
      fetch: recorderFetch([], () => chatResponse({ junk: true })),
    });

    await expect(enhancer.enhance("hi")).rejects.toBeInstanceOf(
      PromptEnhancerError,
    );
  });
});
